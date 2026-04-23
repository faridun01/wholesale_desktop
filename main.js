const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;
const { spawn, execSync } = require('child_process');

let mainWindow;
let splashWindow;
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
    
    // Heuristic: Search for critical tables like 'User' and 'Product'
    if (!content.includes('CREATE TABLE "User"') && !content.includes('CREATE TABLE "users"')) {
      log('Database integrity check failed: "User" table definition not found.');
      return false;
    }

    if (!content.includes('CREATE TABLE "Product"')) {
      log('Database integrity check failed: "Product" table definition not found.');
      return false;
    }

    // Check for specific columns added in recent updates
    if (!content.includes('units_per_box')) {
      log('Database integrity check failed: "units_per_box" column not found in Product table.');
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
  const isValid = isDatabaseValid(dbPath);
  
  if (isDev && isValid) {
    log('Development mode: Using existing valid database at ' + dbPath);
    return;
  }

  if (isValid) {
    log('Database is valid, skipping initialization.');
    return;
  }

  log(`Initializing/Repairing database... (Mode: ${isDev ? 'Development' : 'Production'})`);
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const templateDbPath = path.join(unpackedAppPath, 'backend/prisma/prod.db');
  
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

  if (process.platform === 'win32') {
    try {
      // Find PID on port 3001 and kill it
      const cmd = `netstat -ano | findstr :${port}`;
      const output = execSync(cmd).toString();
      const lines = output.trim().split('\n');
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
           log(`Cleaning up old process ${pid} on port ${port}...`);
           execSync(`taskkill /F /T /PID ${pid}`);
        }
      });
    } catch (e) {
      // Ignore errors if no process found
    }
  }
  
  log('Starting backend process...');
  const serverPath = isDev
    ? path.join(process.cwd(), 'backend/dist/server.js')
    : path.join(unpackedAppPath, 'backend/dist/server.js');
  
  // Important: No manual quotes here. spawn handles spaces automatically if shell is configured correctly.
  const command = isDev ? 'npm.cmd' : process.execPath;
  const args = isDev 
    ? ['run', 'dev:backend'] 
    : [serverPath];

  const childEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: isDev ? 'development' : 'production',
    APP_UPLOADS_DIR: path.join(userDataPath, 'uploads'),
    DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}`,
    // Tell node where to find modules. In production, they are now unpacked for reliability.
    NODE_PATH: isDev 
      ? path.join(process.cwd(), 'node_modules')
      : path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
  };

  if (!isDev) {
    childEnv.ELECTRON_RUN_AS_NODE = '1';
  }

  log(`Spawn command: ${command}`);
  log(`Spawn args: ${JSON.stringify(args)}`);

  backendProcess = spawn(command, args, {
    shell: isDev, // Only use shell in dev mode for npm.cmd
    env: childEnv,
    cwd: isDev ? process.cwd() : unpackedAppPath,
    windowsHide: true
  });

  backendProcess.stdout.on('data', (data) => log(`[BACKEND]: ${data}`));
  backendProcess.stderr.on('data', (data) => log(`[BACKEND ERROR]: ${data}`));
  
  backendProcess.on('error', (err) => log(`Backend spawn error: ${err.message}`));
  backendProcess.on('close', (code) => log(`Backend exited with code ${code}`));
}

function createSplashScreen() {
  try {
    splashWindow = new BrowserWindow({
      width: 500,
      height: 400,
      transparent: false,
      backgroundColor: '#0f172a',
      frame: false,
      alwaysOnTop: true,
      show: true,
      center: true, // Центрируем окно
      skipTaskbar: true, // Не показываем в панели задач
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const splashPath = path.join(__dirname, 'splash.html');
    log(`Loading splash from: ${splashPath}`);
    splashWindow.loadFile(splashPath);
    
    splashWindow.on('closed', () => {
      splashWindow = null;
    });
  } catch (err) {
    log(`Failed to create splash screen: ${err.message}`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    resizable: false,
    frame: false,
    transparent: true,
    show: false,
    autoHideMenuBar: true,
    title: '3Click Склад',
    // backgroundColor: '#111927', // Убираем заливку, чтобы была прозрачность
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

  // When the window is ready to be shown
  mainWindow.once('ready-to-show', () => {
    try {
      // If splash is still there, close it and show main window
      if (splashWindow && !splashWindow.isDestroyed()) {
        setTimeout(() => {
          if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
          }
        }, 2500); // Показываем ровно 2.5 секунды
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
    } catch (err) {
      log(`Error during ready-to-show transition: ${err.message}`);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createSplashScreen(); // Сначала заставка
  
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

function killBackend() {
  if (backendProcess) {
    if (process.platform === 'win32') {
      try {
        // On Windows, use taskkill to kill the entire process tree
        execSync(`taskkill /F /T /PID ${backendProcess.pid}`);
      } catch (e) {
        log(`Warning: taskkill failed: ${e.message}`);
        backendProcess.kill();
      }
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
  }
}

app.on('window-all-closed', () => {
  // If we're in the middle of a splash-to-main transition, don't quit
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length === 0) {
    if (process.platform !== 'darwin') {
      killBackend();
      app.quit();
    }
  }
});

app.on('quit', () => {
  killBackend();
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

ipcMain.handle('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    win.setResizable(true);
    // При максимизации убираем прозрачность, чтобы основное окно было обычным
    // (Большинство ОС не поддерживают прозрачность для максимизированных окон)
    // Но так как у нас темная тема, мы просто разворачиваем его
    win.maximize();
  }
});

ipcMain.handle('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
