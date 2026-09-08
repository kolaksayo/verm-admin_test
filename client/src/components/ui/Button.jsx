import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';

// Zenith/shadcn-style button — variant + size via CVA, but every class is
// expressed in our existing `vs-*` design tokens so it themes (dark/light)
// through the same CSS variables as the rest of the app. Opt-in: nothing
// else changes until a page chooses to render <Button>.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vs-ring ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-vs-bg disabled:pointer-events-none ' +
    'disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:     'bg-vs-purple text-white hover:bg-vs-purple-on',
        secondary:   'bg-vs-elevated text-vs-text hover:bg-vs-hover',
        outline:     'border border-vs-border bg-transparent text-vs-text hover:bg-vs-elevated',
        ghost:       'text-vs-text-3 hover:bg-vs-hover hover:text-vs-text',
        destructive: 'bg-vs-danger text-white hover:bg-vs-danger/90',
        link:        'text-vs-purple-light underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-8 rounded-md px-3 text-xs',
        lg:      'h-10 rounded-lg px-6',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const Button = forwardRef(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export default Button;
