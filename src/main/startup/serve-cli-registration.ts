/** Memorial must not install `orca` or `orca-dev` onto the user PATH over the official CLI. */
export async function registerCliForHeadlessServe(): Promise<void> {
  // Headless serve used to symlink the CLI. That name belongs to official Orca.
}
