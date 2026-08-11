import { Minus, Plus } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { forwardRef, InputHTMLAttributes } from "react"

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "size"
>

interface NumberInputProps extends InputProps {
  value: number
  onChange: (value: number) => void
  size?: "base" | "small"
  min?: number
  max?: number
  step?: number
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      size = "base",
      min = 0,
      max = 100,
      step = 1,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue =
        event.target.value === "" ? min : Number(event.target.value)
      if (
        !isNaN(newValue) &&
        (max === undefined || newValue <= max) &&
        (min === undefined || newValue >= min)
      ) {
        onChange(newValue)
      }
    }

    const handleIncrement = () => {
      const newValue = value + step
      if (max === undefined || newValue <= max) {
        onChange(newValue)
      }
    }

    const handleDecrement = () => {
      const newValue = value - step
      if (min === undefined || newValue >= min) {
        onChange(newValue)
      }
    }

    return (
      <div
        className={clx(
          "shadow-borders-base divide-x overflow-hidden rounded-md bg-ui-bg-field transition-fg inline-flex",
          "[&:has(input:focus)]:shadow-borders-interactive-with-active",
          {
            "h-7": size === "small",
            "h-8": size === "base",
          },
          className
        )}
      >
        <input
          ref={ref}
          type="number"
          value={value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className={clx(
            "txt-compact-small flex-1 bg-transparent px-2 py-1 text-ui-fg-base outline-none [appearance:textfield]",
            "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            "placeholder:text-ui-fg-muted"
          )}
          disabled={disabled}
          {...props}
        />
        <button
          className={clx(
            "flex items-center justify-center outline-none transition-fg",
            "disabled:cursor-not-allowed disabled:text-ui-fg-muted",
            "focus:bg-ui-bg-field-component-hover",
            "hover:bg-ui-bg-field-component-hover",
            {
              "size-7": size === "small",
              "size-8": size === "base",
            }
          )}
          type="button"
          onClick={handleDecrement}
          disabled={(min !== undefined && value <= min) || disabled}
        >
          <Minus />
        </button>
        <button
          className={clx(
            "flex items-center justify-center outline-none transition-fg",
            "disabled:cursor-not-allowed disabled:text-ui-fg-muted",
            "focus:bg-ui-bg-field-hover",
            "hover:bg-ui-bg-field-hover",
            {
              "size-7": size === "small",
              "size-8": size === "base",
            }
          )}
          type="button"
          onClick={handleIncrement}
          disabled={(max !== undefined && value >= max) || disabled}
        >
          <Plus />
        </button>
      </div>
    )
  }
)
