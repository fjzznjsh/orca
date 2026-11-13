import { defineFixture } from '../component-fixtures/component-fixture'
import { MemorialCreateTaskDialog } from './MemorialCreateTaskDialog'

const noop = (): void => undefined

export const dialog = defineFixture({
  width: 620,
  render: () => (
    <div className="bg-background p-6 text-foreground">
      <MemorialCreateTaskDialog open onOpenChange={noop} onSubmit={noop} />
    </div>
  )
})
