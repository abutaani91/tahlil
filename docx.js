/* docx.js — يبني ملف Word (.docx) عربيًّا من اليمين لليسار دون مكتبات خارجية، ويعمل دون إنترنت.
   الواجهة: Docx.doc(opts) → { p(), table(), pageBreak(), blob() }
   النص الغني يقبل <b> و<ltr> فقط (ما عداهما يُهرَّب). */
var Docx = (function () {
  'use strict';
  var FONT = 'Arial';
  function x(s) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* سلسلة غنية → أجزاء {t, b, ltr} */
  function parts(src) {
    var out = [], b = false, ltr = false;
    String(src == null ? '' : src).split(/(<\/?b>|<\/?ltr>)/).forEach(function (tok) {
      if (tok === '<b>') b = true; else if (tok === '</b>') b = false; else if (tok === '<ltr>') ltr = true; else if (tok === '</ltr>') ltr = false;
      else if (tok) out.push({ t: tok, b: b, ltr: ltr });
    });
    return out;
  }
  function run(t, o) {
    var sz = (o.size || 11) * 2, rp = '<w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>' + (o.bold ? '<w:b/><w:bCs/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>' + (o.ltr ? '' : '<w:rtl/>');
    var segs = String(t).split('\n'), h = '';
    segs.forEach(function (sg, i) { h += (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + x(sg) + '</w:t>'; });
    return '<w:r><w:rPr>' + rp + '</w:rPr>' + h + '</w:r>';
  }
  function runs(src, o) {
    o = o || {};
    return parts(src).map(function (p) { return run(p.t, { size: o.size, color: o.color, bold: o.bold || p.b, ltr: p.ltr }); }).join('');
  }
  /* فقرة: o = {align:'center'|'start', after, before, keepNext, size, bold, color, indent, shade, border, pageBreakBefore} */
  function para(src, o) {
    o = o || {};
    var pp = (o.keepNext ? '<w:keepNext/>' : '') + (o.pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
      (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="0E5A5C"/></w:pBdr>' : '') +
      (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '') +
      '<w:bidi/><w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 80 : o.after) + '" w:line="276" w:lineRule="auto"/>' +
      (o.indent ? '<w:ind w:start="' + o.indent + '"/>' : '') + (o.align === 'center' ? '<w:jc w:val="center"/>' : '');
    return '<w:p><w:pPr>' + pp + '</w:pPr>' + runs(src, o) + '</w:p>';
  }
  /* جدول: rows = [[cell,...],...]؛ cell = string | {t, bold, shade, align, span, size}؛ o = {widths:[twips], borders:true|false, headRows:n} */
  function table(rows, o) {
    o = o || {};
    var total = 9638, n = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0), w = o.widths;
    if (!w) { w = []; for (var i = 0; i < n; i++) w.push(Math.floor(total / n)); }
    var bd = o.borders === false ? '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' :
      '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) { return '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>'; }).join('') + '</w:tblBorders>';
    var h = '<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="' + w.reduce(function (a, b) { return a + b; }, 0) + '" w:type="dxa"/>' + bd + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + w.map(function (v) { return '<w:gridCol w:w="' + v + '"/>'; }).join('') + '</w:tblGrid>';
    rows.forEach(function (r, ri) {
      h += '<w:tr><w:trPr><w:cantSplit/>' + (o.headRows && ri < o.headRows ? '<w:tblHeader/>' : '') + '</w:trPr>';
      var ci = 0;
      r.forEach(function (c) {
        if (typeof c === 'string' || typeof c === 'number') c = { t: String(c) };
        var span = c.span || 1, cw = 0; for (var k = 0; k < span; k++) cw += w[ci + k] || 0; ci += span;
        h += '<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') + (c.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + c.shade + '"/>' : '') + '<w:vAlign w:val="' + (c.valign || 'top') + '"/></w:tcPr>' +
          para(c.t, { align: c.align, bold: c.bold, size: c.size || o.size || 10, after: 0, color: c.color }) + '</w:tc>';
      });
      h += '</w:tr>';
    });
    return h + '</w:tbl>' + '<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="60"/></w:pPr></w:p>';
  }

  /* ---------- ZIP (تخزين بلا ضغط) ---------- */
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function zip(files) {
    var chunks = [], central = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      var lh = [0x50, 0x4B, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(lh), name, data);
      central.push({ crc: crc, size: data.length, name: name, off: off });
      off += lh.length + name.length + data.length;
    });
    var cdStart = off, cdLen = 0;
    central.forEach(function (c) {
      var h = [0x50, 0x4B, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
      chunks.push(new Uint8Array(h), c.name); cdLen += h.length + c.name.length;
    });
    chunks.push(new Uint8Array([0x50, 0x4B, 5, 6].concat(u16(0), u16(0), u16(central.length), u16(central.length), u32(cdLen), u32(cdStart), u16(0))));
    return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  function doc(opts) {
    opts = opts || {};
    var body = '', footer = opts.footer || '';
    var api = {
      p: function (t, o) { body += para(t, o); return api; },
      table: function (rows, o) { body += table(rows, o); return api; },
      pageBreak: function () { body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; return api; },
      blob: function () {
        var sect = '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/><w:bidi/></w:sectPr>';
        var document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body + sect + '</w:body></w:document>';
        var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:bidi="ar-JO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
        var foot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '><w:p><w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr>' + (footer ? run(footer + '  ·  ', { size: 9, color: '666666' }) : '') + '<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
        return zip([
          { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>' },
          { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
          { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>' },
          { name: 'word/document.xml', data: document }, { name: 'word/styles.xml', data: styles }, { name: 'word/footer1.xml', data: foot }
        ]);
      }
    };
    return api;
  }
  return { doc: doc, parts: parts, crc32: crc32 };
})();
if (typeof module !== 'undefined') module.exports = Docx;
