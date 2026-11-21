function escape(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function page(kind, frame, receipts, notice = '') {
  const heading = kind === 'shuttle' ? '接驳占位' : '工坊占位';
  const rows = frame[kind].map(item => '<tr>' +
    [item.code,item.start,item.end,item.stop,item.remaining.adult,item.remaining.child].map(v => '<td>'+escape(v)+'</td>').join('') + '</tr>').join('');
  const forms = '<form method="post" action="/'+kind+'/submit"><label>联络号<input name="contact" required></label>' +
    '<label>场次号<input name="code" required></label><label>成员清单<textarea name="members" required></textarea></label><button>提交占位</button></form>' +
    '<form method="get" action="/'+kind+'/lookup"><label>查询联络号<input name="contact" required></label><button>查询回执</button></form>';
  const matches = receipts.map(hold => '<article><h2>'+escape(hold.id)+'</h2><p>场次 '+hold.code+'</p><ul>' +
    hold.members.map(person => '<li>'+escape(person)+'</li>').join('') + '</ul><p>可释放至 '+hold.releaseUntil+'，有效至 '+hold.activeUntil+'，' +
    (hold.released ? '已释放' : frame.tick >= hold.activeUntil ? '已过期' : '有效') + '</p>' +
    '<form method="post" action="/'+kind+'/release"><input type="hidden" name="id" value="'+escape(hold.id)+'"><button>释放占位</button></form></article>').join('');
  return '<h1>'+heading+'</h1><p role="status">'+escape(notice)+'</p><table><thead><tr><th>场次号</th><th>开始</th><th>结束</th>' +
    '<th>站点</th><th>成人余量</th><th>儿童余量</th></tr></thead><tbody>'+rows+'</tbody></table>'+forms+
    '<section aria-label="占位回执">'+matches+'</section>';
}

export async function source({url,req,frame,memory,body,html}) {
  const [,kind,action] = url.pathname.split('/');
  if (!['shuttle','workshop'].includes(kind)) return false;
  const matching = contact => [...memory.values()].filter(hold =>
    hold.contact === contact && hold.kind === kind && hold.visibleAfter <= frame.tick);
  if (req.method === 'GET') {
    const contact = url.searchParams.get('contact');
    return html(200, page(kind, frame, contact ? matching(contact) : [], contact ? '已查联络号 ' + contact : ''));
  }
  const input = await body();
  if (action === 'release') {
    const hold = memory.get(input.id);
    if (!hold || hold.kind !== kind || frame.tick >= hold.releaseUntil) {
      return html(409,page(kind,frame,[],'当前无法释放'));
    }
    hold.released = true;
    return html(200,page(kind,frame,matching(hold.contact),'已受理释放'));
  }
  if (action !== 'submit') return false;
  const slot = frame[kind].find(item => item.code === input.code);
  if (!slot || !input.contact || !input.members) return html(409,page(kind,frame,[],'场次当前不可办'));
  const booked = { adult:0,child:0 };
  for (const hold of memory.values()) {
    if (hold.kind === kind && hold.code === input.code && !hold.released && frame.tick < hold.activeUntil) {
      for (const type of hold.types) booked[type] += 1;
    }
  }
  const hold = { id:kind+'-'+(memory.size+1), code:input.code, contact:input.contact, kind, members:[], types:[],
    visibleAfter: kind === 'shuttle' ? frame.visibleAfter : frame.tick,
    releaseUntil:frame.tick+32, activeUntil:frame.tick+48 };
  for (const line of input.members.split(/\r?\n/)) {
    const [id,type] = line.split(',');
    if (!id || !Object.hasOwn(booked,type) || hold.members.includes(id)) continue;
    const available = booked[type] < slot.remaining[type] &&
      (kind === 'workshop' || booked.adult+booked.child < frame.seats);
    const perRequest = kind === 'shuttle' ? frame.cap : Infinity;
    if (!available || hold.members.length >= perRequest) continue;
    hold.members.push(id);
    hold.types.push(type);
    booked[type] += 1;
  }
  if (!hold.members.length) return html(409,page(kind,frame,[],'当前无可受理成员'));
  memory.set(hold.id,hold);
  if (hold.visibleAfter > frame.tick) return html(202,page(kind,frame,[],'稍后可按联络号查看是否受理'));
  return html(200,page(kind,frame,matching(hold.contact),'可查看受理单'));
}
