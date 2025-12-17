// Simple implementation for number to words
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const TEENS = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function convertChunk(num: number): string {
  let str = "";
  
  if (num >= 100) {
    str += ONES[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }
  
  if (num >= 20) {
    str += TENS[Math.floor(num / 10)] + " ";
    num %= 10;
  }
  
  if (num >= 10 && num < 20) {
    str += TEENS[num - 10] + " ";
    num = 0;
  }
  
  if (num > 0) {
    str += ONES[num] + " ";
  }
  
  return str.trim();
}

export const numberToWords = (num: number): string => {
  if (num === 0) return "Zero";
  
  let words = "";
  
  if (Math.floor(num / 1000) > 0) {
    words += convertChunk(Math.floor(num / 1000)) + " Thousand ";
    num %= 1000;
  }
  
  words += convertChunk(num);
  
  return words.trim() + " Taka Only";
};