import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

// Zenith/shadcn-style card primitives, themed via our `vs-*` tokens.
// Composable: Card > CardHeader > CardTitle/CardDescription, CardContent,
// CardFooter. Opt-in — existing ad-hoc `bg-vs-card` cards are untouched.

export const Card = forwardRef(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl border border-vs-border bg-vs-card text-vs-text shadow-card', className)}
      {...props}
    />
  );
});

export const CardHeader = forwardRef(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />;
});

export const CardTitle = forwardRef(function CardTitle({ className, ...props }, ref) {
  return (
    <h3 ref={ref} className={cn('text-sm font-semibold leading-none tracking-tight text-vs-text', className)} {...props} />
  );
});

export const CardDescription = forwardRef(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-xs text-vs-text-3', className)} {...props} />;
});

export const CardContent = forwardRef(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />;
});

export const CardFooter = forwardRef(function CardFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />;
});

export default Card;
