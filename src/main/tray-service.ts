import { Menu, Tray, nativeImage } from 'electron';

interface TrayHandlers {
  showWindow: () => void;
  refreshNow: () => void;
  signOut: () => void | Promise<void>;
  quit: () => void;
}

class TrayService {
  private readonly handlers: TrayHandlers;
  private tray: Tray | null = null;

  constructor(handlers: TrayHandlers) {
    this.handlers = handlers;
  }

  create(): void {
    if (this.tray) {
      return;
    }

    this.tray = new Tray(createTrayIcon());
    this.tray.setToolTip('Project Calendar');
    this.tray.on('click', () => {
      this.handlers.showWindow();
    });
    this.tray.setContextMenu(this.buildMenu());
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  refreshMenu(): void {
    this.tray?.setContextMenu(this.buildMenu());
  }

  private buildMenu() {
    return Menu.buildFromTemplate([
      {
        label: 'Show Project Calendar',
        click: () => this.handlers.showWindow(),
      },
      {
        label: 'Refresh Now',
        click: () => this.handlers.refreshNow(),
      },
      { type: 'separator' },
      {
        label: 'Sign Out',
        click: () => {
          void this.handlers.signOut();
        },
      },
      {
        label: 'Quit',
        click: () => this.handlers.quit(),
      },
    ]);
  }
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="#13213a" />
      <rect x="14" y="18" width="36" height="32" rx="8" fill="#f4efe7" />
      <rect x="14" y="26" width="36" height="8" fill="#2368ff" />
      <circle cx="24" cy="40" r="3.5" fill="#13213a" />
      <circle cx="40" cy="40" r="3.5" fill="#13213a" />
      <rect x="20" y="10" width="6" height="14" rx="3" fill="#f57d51" />
      <rect x="38" y="10" width="6" height="14" rx="3" fill="#f57d51" />
    </svg>
  `;

  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    .resize({ width: 18, height: 18 });
}

export default TrayService;
