import type { Metadata } from 'next';

import { WikiView, wikiMetadata, type WikiRouteProps } from '@/modules/wiki/components/wiki-view';

export function generateMetadata(props: WikiRouteProps): Promise<Metadata> {
  return wikiMetadata(props);
}

export default function WikiRoute(props: WikiRouteProps) {
  return <WikiView visitor={false} {...props} />;
}
