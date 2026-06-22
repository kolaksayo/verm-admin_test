// Escape a user-supplied string so it can be safely used inside a MongoDB
// $regex (or RegExp) without the input acting as regex metacharacters.
// Prevents NoSQL-injection-style enumeration via patterns like ".*" or anchors.
module.exports = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
