const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;
const { spawn, execSync } = require('child_process');

let mainWindow;
let backendProcess;

// Robust path resolution for packaged apps
const userDataPath = app.getPath('userData');
const unpackedAppPath = isDev
  ? process.cwd()
  : path.join(process.resourcesPath, 'app.asar.unpacked');

// Database paths
const dbPath = isDev
  ? path.join(process.cwd(), 'backend/prisma/dev.db')
  : path.join(userDataPath, 'database.sqlite');

const logFile = path.join(userDataPath, 'backend-log.txt');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line);
  logStream.write(line);
}

/**
 * Ensures the database exists in the userData directory for the packaged app.
 * Instead of running migrations at runtime, we copy a pre-migrated template database.
 */
function ensureDatabase() {
  if (isDev) return;

  log('Checking database...');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    log('Database file not found in userData. Initializing from template...');
    
    // The template is the dev.db we bundled in backend/prisma/
    const templateDbPath = path.join(unpackedAppPath, 'backend/prisma/dev.db');
    
    if (fs.existsSync(templateDbPath)) {
      try {
        fs.copyFileSync(templateDbPath, dbPath);
        log(`Database initialized successfully at: ${dbPath}`);
      } catch (err) {
        log(`CRITICAL: Failed to copy template database: ${err.message}`);
      }
    } else {
      log(`CRITICAL: Template database not found at ${templateDbPath}. Backend will likely fail.`);
    }
  } else {
    log('Database already exists in userData.');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    title: 'Wholesale CRM',
    backgroundColor: '#111927',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, isDev ? 'frontend/public/icon.png' : 'frontend/dist/icon.png')
  });

  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, 'frontend/dist/index.html')}`;
  
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function killProcessOnPort(port) {
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
    const pids = new Set();
    stdout.split('\n').forEach(line => {
      const match = line.match(/LISTENING\s+(\d+)/);
      if (match) pids.add(match[1]);
    });

    pids.forEach(pid => {
      log(`Killing PID ${pid} on port ${port}`);
      try { execSync(`taskkill /F /PID ${pid}`); } catch (e) {}
    });
  } catch (e) {
    // Port likely free
  }
}

function startBackend() {
  const port = 3001;
  killProcessOnPort(port);
  
  log('Spawning backend process...');

  const serverPath = isDev
    ? path.join(process.cwd(), 'backend/dist/server.js')
    : path.join(unpackedAppPath, 'backend/dist/server.js');
  
  const command = isDev ? 'npm.cmd' : process.execPath;
  const args = isDev 
    ? ['run', 'dev:backend'] 
    : [serverPath];

  // Important: Use strings for port and pass DATABASE_URL to override .env
  const childEnv = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${dbPath}`,
    NODE_ENV: isDev ? 'development' : 'production',
    APP_UPLOADS_DIR: path.join(userDataPath, 'uploads')
  };

  if (!isDev) {
    childEnv.ELECTRON_RUN_AS_NODE = '1';
  }

  // Windows: spawn with shell: false and no manual quoting is the safest way 
  // when using node/electron binaries directly.
  backendProcess = spawn(command, args, {
    shell: false, 
    env: childEnv,
    cwd: isDev ? process.cwd() : unpackedAppPath,
    windowsHide: true
  });

  backendProcess.stdout.on('data', (data) => log(`[BACKEND]: ${data}`));
  backendProcess.stderr.on('data', (data) => log(`[BACKEND ERROR]: ${data}`));
  
  backendProcess.on('error', (err) => log(`Backend spawn error: ${err.message}`));
  backendProcess.on('close', (code) => log(`Backend exited with code ${code}`));
}

app.whenReady().then(() => {
  log(`App started. Version: ${app.getVersion()}`);
  log(`UserData: ${userDataPath}`);

  try {
    ensureDatabase();
    startBackend();
  } catch (e) {
    log(`Startup error: ${e.message}`);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) backendProcess.kill();
    app.quit();
  }
});

app.on('quit', () => {
  if (backendProcess) backendProcess.kill();
});

// IPC handlers for window controls
ipcMain.handle('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});

ipcMain.handle('window:toggle-maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  } else {
    win.maximize();
    return true;
  }
});

ipcMain.handle('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
