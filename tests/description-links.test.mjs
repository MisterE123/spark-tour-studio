import test from 'node:test';
import assert from 'node:assert/strict';
import {linkifyDescription} from '../shared/description-links.mjs';

const links=tokens=>tokens.filter(token=>token.type==='link');
function preserved(value){
 const tokens=linkifyDescription(value);
 assert.equal(tokens.map(token=>token.text).join(''),value,'link detection must preserve every character in the authored description');
 for(const token of tokens){assert.ok(token.type==='text'||token.type==='link');assert.deepEqual(Object.keys(token).sort(),token.type==='text'?['text','type']:['href','text','type']);if(token.type==='link')assert.ok(['http:','https:'].includes(new URL(token.href).protocol));}
 return tokens;
}

test('descriptions without URLs remain exact plain text, including blank lines and literal markup',()=>{
 assert.deepEqual(linkifyDescription(''),[]);
 for(const value of ['A place to remember.','First paragraph\n\nSecond paragraph\r\nLast line.','  Spaces\tand tabs  ','<h1>History</h1> &amp; <img src=x onerror=alert(1)>']){
  const tokens=preserved(value);assert.equal(links(tokens).length,0);assert.ok(tokens.every(token=>token.type==='text'));
 }
});

test('HTTP, HTTPS and www links preserve their visible text and normalize safe destinations',()=>{
 const value='Visit HTTP://Example.COM/history or https://example.org:8443/archive?q=a&year=1900#detail and www.example.net/about.';
 assert.deepEqual(links(preserved(value)),[
  {type:'link',text:'HTTP://Example.COM/history',href:'http://example.com/history'},
  {type:'link',text:'https://example.org:8443/archive?q=a&year=1900#detail',href:'https://example.org:8443/archive?q=a&year=1900#detail'},
  {type:'link',text:'www.example.net/about',href:'https://www.example.net/about'}
 ]);
});

test('multiple links across paragraphs retain CRLF, Unicode text, spacing and sentence punctuation',()=>{
 const value='Historic grounds — https://example.org/first,\r\n\r\nRead more:\n  www.example.net/second!\nThen https://example.com/third?';
 const found=links(preserved(value));assert.deepEqual(found.map(token=>token.text),['https://example.org/first','www.example.net/second','https://example.com/third']);
});

test('sentence wrappers are excluded while balanced parentheses and brackets stay inside URLs',()=>{
 for(const [value,expected]of [
  ['Read (https://en.wikipedia.org/wiki/George_Washington_(inventor)).','https://en.wikipedia.org/wiki/George_Washington_(inventor)'],
  ['See (https://example.org/Title_(one_(two))).','https://example.org/Title_(one_(two))'],
  ['[https://example.org/a[b]].','https://example.org/a[b]'],
  ['{https://example.org/a(b)[c]{d}}?!','https://example.org/a(b)[c]{d}'],
  ['“https://example.org/a_(b)”,','https://example.org/a_(b)'],
  ['https://example.org/search?q=one,two&note=(three,four).','https://example.org/search?q=one,two&note=(three,four)']
 ]){const found=links(preserved(value));assert.equal(found.length,1,value);assert.equal(found[0].text,expected,value);assert.equal(found[0].href,new URL(expected).href,value);}
});

test('unsafe schemes and malformed destinations never become anchors or consume source text',()=>{
 for(const value of [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(document.cookie)',
  'data:text/html,<img src=x onerror=alert(1)>',
  'vbscript:msgbox(1) file:///C:/private.txt mailto:person@example.org',
  '//example.org/path',
  '<a href="javascript:alert(1)">Open history</a>',
  'Broken: http:// and https://#fragment'
 ])assert.deepEqual(links(preserved(value)),[],value);
});

test('HTML-looking content surrounding an ordinary URL stays literal data with a safe link token',()=>{
 const value='<strong>History</strong> <img src=x onerror="alert(1)"> https://example.org/?a=1&b=2 <script>alert(1)</script>';
 const tokens=preserved(value),found=links(tokens);assert.deepEqual(found,[{type:'link',text:'https://example.org/?a=1&b=2',href:'https://example.org/?a=1&b=2'}]);
 assert.ok(tokens.filter(token=>token.type==='text').map(token=>token.text).join('').includes('<script>alert(1)</script>'));
});
