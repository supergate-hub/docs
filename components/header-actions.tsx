'use client';

import Link from 'fumadocs-core/link';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { useSpaciousLayout } from 'fumadocs-ui/layouts/spacious';
import { SunMoon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const iconButton = cn(
  buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
  'text-fd-muted-foreground',
);

// Replaces Spacious's options (kebab) menu with a theme button that opens the theme switch.
export function HeaderActions({ className, ...props }: ComponentProps<'div'>) {
  const { menuItems } = useSpaciousLayout();

  return (
    <div
      className={cn('flex items-center gap-1 rounded-lg bg-fd-background', className)}
      {...props}
    >
      {menuItems.map(
        (item) =>
          item.type === 'icon' && (
            <Link
              key={item.url}
              href={item.url}
              external={item.external}
              aria-label={item.label}
              className={iconButton}
            >
              {item.icon}
            </Link>
          ),
      )}
      <Popover>
        <PopoverTrigger
          aria-label="Theme"
          className={cn(
            iconButton,
            'data-popup-open:bg-fd-accent data-popup-open:text-fd-accent-foreground',
          )}
        >
          <SunMoon />
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-auto min-w-0 p-1">
          <ThemeSwitch mode="light-dark-system" />
        </PopoverContent>
      </Popover>
    </div>
  );
}
