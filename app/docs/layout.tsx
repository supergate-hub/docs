import { getLayoutTabs } from 'fumadocs-ui/layouts/shared';
import { DocsLayout as SpaciousLayout } from 'fumadocs-ui/layouts/spacious';
import { DocsLayout as AskAiLayout } from '@/components/ai/layout';
import { HeaderActions } from '@/components/header-actions';
import { baseOptions } from '@/lib/layout.shared';
import { getProduct } from '@/lib/product';
import { askAiEnabled } from '@/lib/shared';
import { source } from '@/lib/source';

// Without the chat wrapper, the header shows no Ask AI button.
const DocsLayout = askAiEnabled ? AskAiLayout : SpaciousLayout;

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const tree = source.getPageTree();
  const tabs = getLayoutTabs(tree, {
    transform(option, node) {
      // Unbind tabs from their folders so they match by URL instead. Folder-bound
      // tabs only render inside a product, which hides the dropdown on the hub page.
      const tab = { ...option, $folder: undefined };
      const product = getProduct(source.getNodeMeta(node)?.path.split('/')[0]);
      if (!product || !node.icon) return tab;

      // Color each product tab icon with that product's accent color.
      return {
        ...tab,
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
