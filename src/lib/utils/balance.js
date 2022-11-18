export 	function flipboard(node, params) {
  const randomChars = '1234567890';
  const text = node.textContent.trim();
  console.log(text);

  return {
    duration: 5000,
    ...params,

    tick(t) {
      let str = '';
      for (let i=0; i<text.length; i++) {
        const progress = i / text.length;
        if (text[i] === ' ' || progress < t * 0.9) {
          str += text[i];
        } else if (progress < t * 1.5) {
          str += randomChars[Math.floor(Math.random() * randomChars.length)];
        } else if (progress < t * 2) {
          str += '-'
        }
      }
      node.textContent = str;
    }
  }
}