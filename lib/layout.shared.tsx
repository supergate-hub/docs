import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { SupergateLogo } from '@/components/logo';
import { gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // Same size as the header logo on supergate.cloud and supergate.cc (136px wide), white in
      // dark mode like supergate.cc.
      title: <SupergateLogo className="h-auto w-34 text-brand dark:text-white" />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
