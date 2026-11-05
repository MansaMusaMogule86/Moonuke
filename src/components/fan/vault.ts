import type { PostView } from "@/server/services/club";
import type { VaultItem } from "@/server/services/fan";

/** Vault items are unlocked by definition; reuse the profile PostTile. */
export const toPostView = (i: VaultItem): PostView => ({
  id: i.id,
  access: i.access,
  teaser: i.teaser,
  mediaKind: i.mediaKind,
  mediaCount: i.mediaCount,
  publishedAt: i.publishedAt,
  priceLabel: null,
  unlocked: true,
  body: i.body,
  media: i.media,
});
