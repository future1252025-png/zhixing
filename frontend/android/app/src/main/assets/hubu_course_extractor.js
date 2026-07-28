(() => {
  const visited = new Set()
  const documents = []

  const visitDocument = (candidate) => {
    if (!candidate || visited.has(candidate)) return
    visited.add(candidate)
    documents.push(candidate)
    for (const frame of candidate.querySelectorAll('iframe, frame')) {
      try {
        visitDocument(frame.contentDocument)
      } catch (error) {
        // Cross-origin frames are deliberately ignored.
      }
    }
  }

  visitDocument(document)

  const weekdayLabels = [
    '星期一',
    '星期二',
    '星期三',
    '星期四',
    '星期五',
    '星期六',
    '星期日',
    '星期天'
  ]
  const candidates = []

  for (const candidateDocument of documents) {
    for (const table of candidateDocument.querySelectorAll('table')) {
      const text = (table.innerText || table.textContent || '').replace(/\s+/g, ' ').trim()
      const weekdays = new Set(
        weekdayLabels
          .filter((weekday) => text.includes(weekday))
          .map((weekday) => weekday === '星期天' ? '星期日' : weekday)
      )
      if (weekdays.size < 3) continue
      candidates.push({
        table,
        text,
        score: weekdays.size * 1000000 + Math.min(text.length, 999999)
      })
    }
  }

  candidates.sort((left, right) => right.score - left.score)
  const selected = candidates[0]
  if (!selected) {
    return JSON.stringify({
      ok: false,
      message: '当前页面没有找到完整课表，请先进入“学期理论课表”页面'
    })
  }

  const selectedDocument = selected.table.ownerDocument
  const sourceUrl = (
    selectedDocument.location && selectedDocument.location.href
  ) || location.href
  const pageTitle = selectedDocument.title || document.title || '湖北大学教务系统课表'
  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const visibleCellText = (cell) => {
    if (typeof cell.innerText === 'string') {
      return cell.innerText
    }

    const parts = []
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.nodeValue || '')
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return

      const tag = node.tagName.toLowerCase()
      if (tag === 'br') {
        parts.push('\n')
        return
      }
      const isBlock = [
        'div', 'p', 'section', 'article', 'header', 'footer', 'li'
      ].includes(tag)
      if (isBlock && parts.length > 0 && parts[parts.length - 1] !== '\n') {
        parts.push('\n')
      }
      for (const child of node.childNodes) walk(child)
      if (isBlock && parts[parts.length - 1] !== '\n') parts.push('\n')
    }
    walk(cell)
    return parts.join('')
  }

  const normalizedRows = Array.from(selected.table.rows).map((row) => {
    const cells = Array.from(row.cells).map((cell) => {
      const tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td'
      const rowspan = Number.parseInt(cell.getAttribute('rowspan') || '1', 10)
      const colspan = Number.parseInt(cell.getAttribute('colspan') || '1', 10)
      const spanAttributes = [
        Number.isFinite(rowspan) && rowspan > 1 ? ` rowspan="${rowspan}"` : '',
        Number.isFinite(colspan) && colspan > 1 ? ` colspan="${colspan}"` : ''
      ].join('')
      const content = visibleCellText(cell)
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => escapeHtml(line.trim()))
        .filter(Boolean)
        .join('<br>')
      return `<${tag}${spanAttributes}>${content}</${tag}>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  return JSON.stringify({
    ok: true,
    text: selected.text,
    sourceUrl,
    pageTitle,
    html: [
      '<!doctype html><html><head><meta charset="utf-8"><title>',
      escapeHtml(pageTitle),
      '</title></head><body>',
      '<table>',
      normalizedRows,
      '</table>',
      '</body></html>'
    ].join('')
  })
})()
