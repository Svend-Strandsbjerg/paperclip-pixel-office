/** Six-seat studios repeat vertically: fixed width keeps existing seats stationary. */
export const MODULE_WIDTH = 640
export const MODULE_HEIGHT = 448
export const MODULE_CAPACITY = 6
export type Rect = { x: number; y: number; width: number; height: number }
export function seatPosition(slot: number) {
  return { col: slot % 2 ? 19 : 6, row: 6 + Math.floor(slot % MODULE_CAPACITY / 2) * 8 + Math.floor(slot / MODULE_CAPACITY) * (MODULE_HEIGHT / 16) }
}
export function activityAnchor(seat: { col: number; row: number }) {
  return { x: seat.col * 16 + 8, y: seat.row * 16 + 52 }
}
export function officeLayout(state: readonly { col: number; row: number }[]) {
  const count = Math.max(1, ...state.map(a => Math.floor((a.row - 6) / (MODULE_HEIGHT / 16)) + 1))
  return { width: MODULE_WIDTH, height: count * MODULE_HEIGHT,
    modules: Array.from({ length: count }, (_, index) => ({ index, x: 16, y: index * MODULE_HEIGHT + 16, width: MODULE_WIDTH - 32, height: MODULE_HEIGHT - 32, workspaceRight: 432 })),
    anchors: state.map(activityAnchor),
    furniture: state.map(deskBounds),
  }
}

/** Union of the desktop and its three-pixel lower edge. */
export function deskBounds(seat: { col: number; row: number }): Rect {
  return { x: seat.col * 16 - 30, y: seat.row * 16 - 15, width: 76, height: 29 }
}
export function workspacePad(seat: { col: number; row: number }): Rect {
  return { x: seat.col * 16 - 72, y: seat.row * 16 - 6, width: 160, height: 64 }
}
