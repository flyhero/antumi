import { describe, expect, it } from 'vitest'
import { withStoredImages } from './preview-images'

const image = (n: number) => ({ id: `${String(n).repeat(64)}.png`, width: 4, height: 3 })

describe('pictures core kept of a preview', () => {
  it('gives each image file its copy in order, and a page none', () => {
    const files = [{ path: '/a.png', title: null }, { path: '/page.html', title: null }, { path: '/b.jpg', title: null }]
    expect(withStoredImages(files, [image(1), image(2)]).map((file) => file.stored)).toEqual([image(1), null, image(2)])
  })

  it('uses none when not every picture was kept, rather than put one in another\'s place', () => {
    const files = [{ path: '/a.png', title: null }, { path: '/b.png', title: null }]
    expect(withStoredImages(files, [image(2)]).map((file) => file.stored)).toEqual([null, null])
    expect(withStoredImages(files, undefined).map((file) => file.stored)).toEqual([null, null])
  })
})
