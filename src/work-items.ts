/** One presentation card per occupied workstation. Never stores task/customer text. */
export type WorkItem = { taskId: string; phase: 'waiting' | 'processing'; placed: number }
export function workItems() {
  const items = new Map<string, WorkItem>()
  return {
    sync(ids: readonly string[]) {
      const present = new Set(ids)
      for (const id of items.keys()) if (!present.has(id)) items.delete(id)
    },
    place(id: string, taskId: string, now: number) { items.set(id, { taskId, phase: 'waiting', placed: now }) },
    pickup(id: string) { const item = items.get(id); items.delete(id); return item },
    sample(id: string, working: boolean, atDesk: boolean, now: number) {
      const item = items.get(id)
      if (item && working && atDesk && now - item.placed >= 1) item.phase = 'processing'
      return item
    },
  }
}

export function paintWorkItem(ctx: CanvasRenderingContext2D, anchor: { x: number; y: number }, processing: boolean) {
  const x = (anchor.x + 35) * 3, y = (anchor.y - 28) * 3
  ctx.fillStyle = '#596575'; ctx.fillRect(x - 3, y - 3, 48, 60)
  ctx.fillStyle = '#fff4d6'; ctx.fillRect(x, y, 42, 54)
  ctx.fillStyle = processing ? '#95bd72' : '#d7aa66'; ctx.fillRect(x, y, 42, 6)
  ctx.fillStyle = '#8794a0'; ctx.fillRect(x + 6, y + 15, 27, 3); ctx.fillRect(x + 6, y + 24, 21, 3)
}
