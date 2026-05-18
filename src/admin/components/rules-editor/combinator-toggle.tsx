import * as ToggleGroup from "@radix-ui/react-toggle-group"
import type { Combinator } from "./types"

type Props = {
  value: Combinator
  onChange: (value: Combinator) => void
}

export const CombinatorToggle = ({ value, onChange }: Props) => {
  const handleChange = (next: string) => {
    if (next === "and" || next === "or") onChange(next)
  }

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={handleChange}
      className="inline-flex rounded-md border border-ui-border-base overflow-hidden"
    >
      {(["and", "or"] as const).map((v) => (
        <ToggleGroup.Item
          key={v}
          value={v}
          className="px-2.5 py-0.5 text-xs font-medium uppercase transition-colors
            data-[state=on]:bg-ui-bg-base data-[state=on]:text-ui-fg-base
            data-[state=off]:bg-ui-bg-subtle data-[state=off]:text-ui-fg-muted
            hover:data-[state=off]:bg-ui-bg-subtle-hover
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive"
        >
          {v}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
