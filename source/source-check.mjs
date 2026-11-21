import { chromium } from 'playwright';
export async function exercise({base,move,assert}) {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(base+'/shuttle');
    assert.match(await page.getByRole('table').innerText(), /B7/);
    await page.getByLabel('联络号',{exact:true}).fill('T-X01');
    await page.getByLabel('场次号').fill('B7');
    await page.getByLabel('成员清单').fill('M1,adult\nM2,child\nM3,child');
    await page.getByRole('button',{name:'提交占位'}).click();
    assert.match(await page.getByRole('status').innerText(),/稍后/);
    assert.equal(await page.getByRole('heading',{name:'shuttle-1'}).count(),0);
    await move(1);
    await page.getByLabel('查询联络号').fill('T-X01');
    await page.getByRole('button',{name:'查询回执'}).click();
    assert.deepEqual(await page.locator('article li').allTextContents(), ['M1','M2']);
    await page.getByRole('button',{name:'释放占位'}).click();
    assert.match(await page.locator('article').innerText(), /已释放/);
  } finally { await browser.close(); }
}
