import { isPreviewImage, type ChatImage, type PreviewFile } from '@antumi/protocol'
// The copies core kept of a call's pictures, one per image file in order: taken only when every one
// was kept, so a picture is never put in another's place.
export function withStoredImages<T extends PreviewFile>(files: readonly T[], images: readonly ChatImage[] | undefined): (T & { stored: ChatImage | null })[] {
  const pictures = files.filter((file) => isPreviewImage(file.path)).length
  const aligned = images?.length === pictures ? images : []
  let next = 0
  return files.map((file) => ({ ...file, stored: isPreviewImage(file.path) ? aligned[next++] ?? null : null }))
}
