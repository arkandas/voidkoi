import type { Metadata } from 'next';

import { WikiView, wikiMetadata, type WikiRouteProps } from '@/modules/wiki/components/wiki-view';

export function generateMetadata(props: WikiRouteProps): Promise<Metadata> {
  return wikiMetadata(props);
}

/** A page of the wiki for visitors. The proxy serves it at the page's own address, `/wiki/…`. */
export default function PublicWikiRoute(props: WikiRouteProps) {
  return <WikiView visitor {...props} />;
}
