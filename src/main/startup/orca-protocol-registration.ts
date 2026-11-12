import type { App } from 'electron'

/**
 * Official Orca owns `orca://`. This fork does not register the protocol.
 * macOS would otherwise take it from Info.plist; that scheme is removed from the packager config.
 */
export function registerOrcaProtocolClient(
  _app: Pick<App, 'isPackaged' | 'isDefaultProtocolClient' | 'setAsDefaultProtocolClient'>,
  _options: { platform: NodeJS.Platform; desktopLaunch: boolean }
): boolean {
  return false
}
