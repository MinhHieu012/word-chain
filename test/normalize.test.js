import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../public/normalize.js';

test('hai kiểu đặt dấu cho ra cùng một chuỗi', () => {
  assert.equal(normalize('hòa bình'), normalize('hoà bình'));
  assert.equal(normalize('hóa học'), 'hoá học');
  assert.equal(normalize('khỏe mạnh'), 'khoẻ mạnh');
  assert.equal(normalize('thủy thủ'), 'thuỷ thủ');
  assert.equal(normalize('quý báu'), 'quý báu');
});

test('không đổi vần có phụ âm cuối hoặc vần khác', () => {
  assert.equal(normalize('hoàng hôn'), 'hoàng hôn');
  assert.equal(normalize('khuya khoắt'), 'khuya khoắt');
  assert.equal(normalize('trời xanh'), 'trời xanh');
});

test('y sau phụ âm đầu, không có âm cuối → i', () => {
  assert.equal(normalize('bác sỹ'), 'bác sĩ');
  assert.equal(normalize('kỹ thuật'), normalize('kĩ thuật'));
  assert.equal(normalize('lý do'), 'lí do');
  assert.equal(normalize('hy vọng'), 'hi vọng');
  assert.equal(normalize('bánh mỳ'), 'bánh mì');
});

test('giữ y khi là âm đệm, đứng đầu hoặc sau nguyên âm', () => {
  assert.equal(normalize('quý báu'), 'quý báu');
  assert.equal(normalize('thủy thủ'), 'thuỷ thủ');
  assert.equal(normalize('ý nghĩa'), 'ý nghĩa');
  assert.equal(normalize('y tế'), 'y tế');
  assert.equal(normalize('bàn tay'), 'bàn tay');
  assert.equal(normalize('khuyên bảo'), 'khuyên bảo');
});

test('NFD, chữ hoa, khoảng trắng thừa', () => {
  assert.equal(normalize('  Trời   XANH '.normalize('NFD')), 'trời xanh');
});
