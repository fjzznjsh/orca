import { BrowserWindow } from 'electron'
import { MEMORIAL_IPC_CHANNELS } from '../../shared/memorial/ipc-contract'

export function broadcastMemorialTaskUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(MEMORIAL_IPC_CHANNELS.taskUpdated)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}
