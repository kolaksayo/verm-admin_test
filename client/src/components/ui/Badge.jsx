import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';

// Zenith/shadcn-style badge — pill label with semantic variants, themed via
// our `vs-*` tokens. Opt-in; existing inline pill spans are untouched.
export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none transition-colors',
  {
    variants: {
      variant: {
        default:   'bg-vs-purple/20 text-vs-purple-light',
        secondary: 'bg-vs-elevated text-vs-text-2',
        success:   'bg-vs-success/15 text-vs-success',
        warning:   'bg-vs-warning/15 text-vs-warning',
        danger:    'bg-vs-danger/15 text-vs-danger',
        outline:   'border border-vs-border text-vs-text-3',
        // Gentelella-style status dot: small coloured circle + label text.
        // Colour the dot via a `before:bg-*` className on the Badge itself,
        // e.g. <Badge variant="dot" className="before:bg-vs-success">Active</Badge>
        dot: 'rounded-none px-0 gap-1.5 text-xs font-medium text-vs-text-2 before:content-[""] before:w-2 before:h-2 before:rounded-full before:flex-shrink-0',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export default function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
