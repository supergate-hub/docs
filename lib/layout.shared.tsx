import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { SupergateLogo } from '@/components/logo';
import { gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <SupergateLogo className="h-8 w-auto text-brand dark:text-white" />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
