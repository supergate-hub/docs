import { getLayoutTabs } from 'fumadocs-ui/layouts/shared';
import { DocsLayout } from 'fumadocs-ui/layouts/spacious';
import { HeaderActions } from '@/components/header-actions';
import { baseOptions } from '@/lib/layout.shared';
import { getProduct } from '@/lib/product';
import { source } from '@/lib/source';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const tree = source.getPageTree();
  // Color each product tab icon with that product's accent color.
  const tabs = getLayoutTabs(tree, {
    transform(option, node) {
      const product = getProduct(source.getNodeMeta(node)?.path.split('/')[0]);
      if (!product || !node.icon) return option;

      return {
        ...option,
        icon: <div style={{ color: `var(--product-${product}-color)` }}>{node.icon}</div>,
      };
    },
  });

  return (
    <DocsLayout tree={tree} tabs={tabs} slots={{ actions: HeaderActions }} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
