const fs = require("fs");
const path = require("path");
const files = [
  "app.js",
  "canvas_renderer.js",
  "const.js",
  "editor_input_controller.js",
  "index.html",
  "shapes.js",
  "style.css",
  "util.js",
  "README.md",
];
const dir = __dirname;
for (const file of files) {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(/^([ ]+)/gm, (m) => m.replace(/  /g, "    "));
  fs.writeFileSync(filePath, content);
  console.log("OK", file);
}
