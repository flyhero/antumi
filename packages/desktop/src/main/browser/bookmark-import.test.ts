import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chromiumBookmarks, findBookmarkSources, htmlBookmarks, readBookmarkSource, type BookmarkPlaces } from './bookmark-import'

const chromiumFile = {
  version: 1,
  roots: {
    bookmark_bar: {
      type: 'folder', name: 'Bookmarks bar', children: [
        { type: 'url', name: 'Admin', url: 'https://admin.example.com/' },
        { type: 'folder', name: 'Work', children: [{ type: 'url', name: ' Grafana ', url: 'https://grafana.example.com/d/1' }] },
        { type: 'url', name: 'Bookmarklet', url: 'javascript:alert(1)' }
      ]
    },
    other: { type: 'folder', name: 'Other bookmarks', children: [{ type: 'url', name: 'Settings', url: 'chrome://settings' }] },
    synced: { type: 'folder', name: 'Mobile bookmarks', children: [] }
  }
}

describe('chromiumBookmarks', () => {
  it('keeps the web pages, each with the folders it sits in', () => {
    expect(chromiumBookmarks(chromiumFile)).toEqual([
      { title: 'Admin', url: 'https://admin.example.com/', folder: 'Bookmarks bar' },
      { title: 'Grafana', url: 'https://grafana.example.com/d/1', folder: 'Bookmarks bar / Work' }
    ])
  })

  it('finds nothing in what is not a bookmarks file', () => {
    expect(chromiumBookmarks(null)).toEqual([])
    expect(chromiumBookmarks({ roots: { bar: 'nope' } })).toEqual([])
  })
})

describe('htmlBookmarks', () => {
  it('reads an exported bookmarks page, folders and all', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1">Bookmarks Toolbar</H3>
  <DL><p>
    <DT><A HREF="https://admin.example.com/?a=1&amp;b=2" ADD_DATE="1">Admin &amp; ops</A>
    <DT><H3>Work</H3>
    <DL><p>
      <DT><A href='https://grafana.example.com/'>Grafana</A>
    </DL><p>
  </DL><p>
  <DT><A HREF="place:sort=8">Recent</A>
  <DT><A HREF="https://news.example.org/"><b>News</b></A>
</DL><p>`
    expect(htmlBookmarks(html)).toEqual([
      { title: 'Admin & ops', url: 'https://admin.example.com/?a=1&b=2', folder: 'Bookmarks Toolbar' },
      { title: 'Grafana', url: 'https://grafana.example.com/', folder: 'Bookmarks Toolbar / Work' },
      { title: 'News', url: 'https://news.example.org/', folder: null }
    ])
  })
})

describe('bookmark sources', () => {
  let home: string
  let places: BookmarkPlaces

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), 'antumi-bookmark-import-'))
    places = { platform: 'darwin', home, env: {} }
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const write = (relative: string, content: unknown) => {
    const file = path.join(home, 'Library', 'Application Support', relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
  }

  it('lists each profile that has bookmarks, by the name the user gave it', async () => {
    write('Google/Chrome/Local State', { profile: { info_cache: { Default: { name: '个人' }, 'Profile 1': { name: '工作' }, 'Profile 2': { name: 'Empty' } } } })
    write('Google/Chrome/Default/Bookmarks', chromiumFile)
    write('Google/Chrome/Profile 1/Bookmarks', { roots: { bookmark_bar: { type: 'folder', name: 'Bar', children: [{ type: 'url', name: 'A', url: 'https://a.example.com/' }] } } })
    write('Microsoft Edge/Default/Bookmarks', chromiumFile)

    expect(await findBookmarkSources(places)).toEqual([
      { id: 'chrome/Default', browser: 'Google Chrome', profile: '个人', count: 2 },
      { id: 'chrome/Profile 1', browser: 'Google Chrome', profile: '工作', count: 1 },
      { id: 'edge/Default', browser: 'Microsoft Edge', profile: 'Default', count: 2 }
    ])
    expect(await readBookmarkSource('chrome/Profile 1', places)).toEqual([{ title: 'A', url: 'https://a.example.com/', folder: 'Bar' }])
  })

  it('reads only the bookmarks file of a known browser profile', async () => {
    write('Google/Chrome/Default/Bookmarks', chromiumFile)
    await expect(readBookmarkSource('chrome/../../Secrets', places)).rejects.toThrow('bookmarks-unreadable')
    await expect(readBookmarkSource('safari/Default', places)).rejects.toThrow('bookmarks-unreadable')
    await expect(readBookmarkSource('chrome/Profile 9', places)).rejects.toThrow('bookmarks-unreadable')
  })
})
