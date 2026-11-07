function horizontalList(item) {
  return item?.shelfRenderer?.content?.horizontalListRenderer;
}

function isPlainVideoShelf(item) {
  const shelf = item?.shelfRenderer;
  const list = horizontalList(item);
  return shelf?.tvhtml5Metadata?.retainShelfIndex === true &&
    !shelf.headerRenderer && !shelf.icon && !shelf.tvhtml5ShelfRendererType &&
    list?.items?.length > 0 && !list.continuations?.length &&
    list.items.every(({ tileRenderer: tile }) =>
      tile?.style === 'TILE_STYLE_YTLR_DEFAULT' &&
      tile.contentType === 'TILE_CONTENT_TYPE_VIDEO');
}

function isPlainVideoRow(item) {
  return isPlainVideoShelf(item) && horizontalList(item).items.length === 3;
}

function packRows(shelves, columns) {
  const packed = [];
  for (let start = 0; start < shelves.length;) {
    if (!isPlainVideoRow(shelves[start])) {
      packed.push(shelves[start++]);
      continue;
    }

    let end = start + 1;
    while (end < shelves.length && isPlainVideoRow(shelves[end])) end++;
    const run = shelves.slice(start, end);
    if (columns === 3 || run.length === 1) {
      packed.push(...run);
    } else {
      const videos = [];
      for (const item of run) videos.push(...horizontalList(item).items);
      for (let offset = 0; offset < videos.length; offset += columns) {
        const template = run[Math.floor(offset / 3)];
        const shelf = template.shelfRenderer;
        const items = videos.slice(offset, offset + columns);
        const list = {
          ...horizontalList(template),
          items,
          collapsedItemCount: items.length,
          visibleItemCount: items.length,
          selectedIndex: 0,
          tb: 0
        };
        packed.push({
          ...template,
          shelfRenderer: { ...shelf, content: { ...shelf.content, horizontalListRenderer: list } }
        });
      }
    }
    start = end;
  }
  return packed;
}

const feeds = new WeakMap();

export function reflowHomeShelves(section, scale) {
  const component = section.__instance;
  const data = component?.props?.data;
  const current = data?.contents;
  if (!Array.isArray(current) || component.items !== current ||
      typeof component.Ga !== 'function') return;

  const previous = feeds.get(data);
  const appending = previous && current.length >= previous.applied.length &&
    previous.applied.every((item, index) => item === current[index]);
  const viewport = window.innerWidth;
  const sameLayout = appending && previous.scale === scale && previous.viewport === viewport;
  if (sameLayout && current.length === previous.applied.length) return;

  const original = appending
    ? previous.original.concat(current.slice(previous.applied.length))
    : current;

  let columns = 3;
  if (sameLayout) {
    columns = previous.columns;
  } else if (scale !== 1) {
    const videoRows = new Set(current.filter(isPlainVideoShelf)
      .map(item => horizontalList(item).items));
    const sample = Array.from(section.querySelectorAll('ytlr-horizontal-list-renderer > yt-virtual-list'))
      .find(row => videoRows.has(row.__instance?.props?.items));
    const tile = sample?.querySelector('ytlr-tile-renderer');
    if (tile) {
      const { spacing, Ba: inset } = sample.__instance.props;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const width = parseFloat(getComputedStyle(tile).width) * scale;
      const gap = spacing * rem * scale;
      const available = viewport - inset * rem;
      if (width > 0 && Number.isFinite(available + gap)) {
        columns = Math.max(1, Math.floor((available + gap) / (width + gap)));
      }
    } else {
      columns = previous?.columns || 3;
    }
  }

  if (appending && current.length === previous.applied.length &&
      columns === previous.columns) return;

  const packed = packRows(original, columns);
  if (packed.length === current.length && packed.every((item, index) => item === current[index])) return;

  const selectedIndex = component.selectedIndex;
  const selected = current[selectedIndex];
  const selectedList = horizontalList(selected);
  const selectedVideo = selectedList?.items[selectedList.selectedIndex ?? 0];
  let row = packed.indexOf(selected);
  if (row < 0 && selectedVideo) {
    row = packed.findIndex(item => horizontalList(item)?.items.includes(selectedVideo));
    if (row >= 0) {
      const list = horizontalList(packed[row]);
      list.selectedIndex = list.items.indexOf(selectedVideo);
      list.tb = 0;
      data.selectedColumn = list.selectedIndex;
    }
  }

  data.contents = packed;
  if (row >= 0 && row !== selectedIndex) {
    component.selectedIndex = row;
    data.tb = undefined;
  }
  feeds.set(data, { original, applied: packed.slice(), columns, viewport, scale });
  component.Ga();
}
