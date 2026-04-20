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
 * Checks if the existing SQLite database is valid and contains the necessary tables.
 * Since we don't have a sqlite3 library in the main process, we use a heuristic:
 * 1. Check file size (it should be comparable to our template).
 * 2. Scan the file for the 'users' table definition.
 */
function isDatabaseValid(pathToCheck) {
  try {
    if (!fs.existsSync(pathToCheck)) return false;

    const stats = fs.statSync(pathToCheck);
    // If the file is extremely small (e.g. < 20KB), it's likely empty or corrupted
    if (stats.size < 20000) {
      log(`Database file is too small (${stats.size} bytes). Marking as invalid.`);
      return false;
    }

    // Heuristic: Search for the 'User' or 'users' schema definition in the SQLite binary
    // SQLite stores its schema in plain text within the database file.
    const buffer = fs.readFileSync(pathToCheck, { encoding: null, flag: 'r' });
    const content = buffer.toString('binary');
    
    // Prisma model 'User' usually results in a table named 'User' or 'users'
    if (!content.includes('CREATE TABLE "User"') && !content.includes('CREATE TABLE "users"')) {
      log('Database integrity check failed: "User" table definition not found.');
      return false;
    }

    return true;
  } catch (err) {
    log(`Error checking database integrity: ${err.message}`);
    return false;
  }
}

/**
 * Ensures the database exists and is valid in the userData directory.
 */
function ensureDatabase() {
  if (isDev) return;

  log('Initializing database check...');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const templateDbPath = path.join(unpackedAppPath, 'backend/prisma/dev.db');
  
  const copyTemplate = (reason) => {
    log(`Action: Copying template database. Reason: ${reason}`);
    if (fs.existsSync(templateDbPath)) {
      try {
        fs.copyFileSync(templateDbPath, dbPath);
        log(`Database successfully initialized at: ${dbPath}`);
      } catch (err) {
        log(`CRITICAL ERROR: Failed to copy database template: ${err.message}`);
      }
    } else {
      log(`CRITICAL ERROR: Template database missing at ${templateDbPath}`);
    }
  };

  if (!fs.existsSync(dbPath)) {
    copyTemplate('New installation (file missing)');
  } else {
    log('Database file exists. Verifying integrity...');
    if (!isDatabaseValid(dbPath)) {
      const backupPath = `${dbPath}.bak_${Date.now()}`;
      try {
        fs.renameSync(dbPath, backupPath);
        log(`Invalid database backed up to: ${path.basename(backupPath)}`);
      } catch (e) {
        log(`Warning: Failed to backup invalid database: ${e.message}`);
      }
      copyTemplate('Existing database was invalid or empty');
    } else {
      log('Existing database passed the integrity check.');
    }
  }
}

function startBackend() {
  const port = 3001;
  
  log('Starting backend process...');
  const serverPath = isDev
    ? path.join(process.cwd(), 'backend/dist/server.js')
    : path.join(unpackedAppPath, 'backend/dist/server.js');
  
  const command = isDev ? 'npm.cmd' : process.execPath;
  const args = isDev 
    ? ['run', 'dev:backend'] 
    : [serverPath];

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
  log(`UserData path: ${userDataPath}`);

  try {
    ensureDatabase();
    startBackend();
  } catch (e) {
    log(`Critical startup error: ${e.message}`);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) backendProcess.kill();
    app.quit();
  }
});

app.on('quit', () => {
  if (backendProcess) backendProcess.kill();
});

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
