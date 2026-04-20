const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;
const { spawn, execSync } = require('child_process');

let mainWindow;
let backendProcess;

const unpackedAppPath = isDev
  ? process.cwd()
  : path.join(process.resourcesPath, 'app.asar.unpacked');

const dbPath = isDev
  ? path.join(process.cwd(), 'backend/prisma/dev.db')
  : path.join(app.getPath('userData'), 'database.sqlite');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    title: '',
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
    const lines = stdout.split('\n');
    const pids = new Set();
    
    lines.forEach(line => {
      const match = line.match(/LISTENING\s+(\d+)/);
      if (match) pids.add(match[1]);
    });

    pids.forEach(pid => {
      console.log(`Killing process ${pid} on port ${port}`);
      try {
        execSync(`taskkill /F /PID ${pid}`);
      } catch (e) {
        // Ignore if process already gone
      }
    });

    // Small delay to ensure port is released
    execSync('timeout /t 1 /nobreak > nul', { shell: true });
  } catch (e) {
    // Port likely not in use
  }
}

function runMigrations() {
  if (isDev) return;

  console.log('Running migrations...');
  const prismaPath = path.join(unpackedAppPath, 'node_modules/prisma/build/index.js');
  const schemaPath = path.join(unpackedAppPath, 'backend/prisma/schema.prisma');

  try {
    execSync(`"${process.execPath}" "${prismaPath}" migrate deploy --schema="${schemaPath}"`, {
      env: {
        ...process.env,
        DATABASE_URL: `file:${dbPath}`,
        ELECTRON_RUN_AS_NODE: '1'
      }
    });
    console.log('Migrations applied successfully');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

function startBackend() {
  const port = 3001;
  killProcessOnPort(port);
  
  console.log('Starting backend...');
  const serverPath = isDev
    ? path.join(process.cwd(), 'backend/dist/server.js')
    : path.join(unpackedAppPath, 'backend/dist/server.js');
  
  const command = isDev ? 'npm' : process.execPath;
  const args = isDev 
    ? ['run', 'dev:backend'] 
    : [serverPath];

  const logDir = app.getPath('userData');
  const logFile = path.join(logDir, 'backend-log.txt');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  
  const childEnv = {
    ...process.env,
    PORT: port,
    DATABASE_URL: `file:${dbPath}`,
    APP_UPLOADS_DIR: path.join(logDir, 'uploads'),
    NODE_ENV: isDev ? 'development' : 'production'
  };

  if (!isDev) {
    childEnv.ELECTRON_RUN_AS_NODE = '1';
  }

  backendProcess = spawn(command, args, {
    shell: true,
    env: childEnv,
    cwd: unpackedAppPath
  });

  backendProcess.stdout.on('data', (data) => logStream.write(`[STDOUT]: ${data}`));
  backendProcess.stderr.on('data', (data) => logStream.write(`[STDERR]: ${data}`));
  
  backendProcess.on('close', (code) => logStream.write(`Backend exited with code ${code}\n`));
}

app.whenReady().then(async () => {
  runMigrations();
  startBackend();
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

ipcMain.handle('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle('window:toggle-maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return false;
  win.isMaximized() ? win.unmaximize() : win.maximize();
  return win.isMaximized();
});
ipcMain.handle('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
