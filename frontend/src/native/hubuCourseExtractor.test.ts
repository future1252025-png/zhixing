import { afterEach, describe, expect, it } from 'vitest'

import extractorScript from '../../android/app/src/main/assets/hubu_course_extractor.js?raw'

function runExtractor(): {
  ok: boolean
  message?: string
  html?: string
  text?: string
} {
  const serialized = window.eval(extractorScript) as string
  return JSON.parse(serialized)
}

describe('Hubu timetable DOM extractor', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.title = ''
  })

  it('captures only the best timetable table and leaves credentials outside the payload', () => {
    document.body.innerHTML = `
      <form>
        <input name="username" value="20260001">
        <input name="password" value="never-export-this">
      </form>
      <table id="navigation"><tr><td>星期一 星期二 星期三</td></tr></table>
      <table id="timetable" onclick="stealCookies()">
        <tr>
          <th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th>
        </tr>
        <tr>
          <td>01-02节</td>
          <td>操作系统<br>1-16周<br>教3-407</td>
          <td>计算机网络<br>1-14周<br>教4-608</td>
          <td>算法设计与分析<br>1-16周<br>教4-202</td>
          <td></td><td></td>
        </tr>
      </table>
    `

    const result = runExtractor()

    expect(result.ok).toBe(true)
    expect(result.html).toContain('<table>')
    expect(result.html).toContain('教4-202')
    expect(result.html).not.toContain('name="password"')
    expect(result.html).not.toContain('never-export-this')
    expect(result.html).not.toContain('onclick')
    expect(result.html).not.toContain('stealCookies')
  })

  it('refuses to manufacture a capture on a login or navigation page', () => {
    document.body.innerHTML = '<main><h1>统一身份认证</h1><p>请输入学号和密码</p></main>'

    const result = runExtractor()

    expect(result.ok).toBe(false)
    expect(result.message).toContain('学期理论课表')
  })
})
