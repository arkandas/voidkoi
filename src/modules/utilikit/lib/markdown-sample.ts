import type { Locale } from '@/i18n/config';

/** The Markdown the preview starts from when asked for an example, in each language. */
export const MARKDOWN_SAMPLES: Record<Locale, string> = {
  en: `# Markdown Preview

Welcome to the **Markdown Preview** tool! It supports GitHub Flavored Markdown.

## Features

- **Bold** and *italic* text
- [Links](https://example.com)
- Ordered and unordered lists
- Code blocks with syntax highlighting
- Tables and task lists
- ~~Strikethrough~~
- And much more!

## Code example

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet('World');
\`\`\`

## Table example

| Feature | Supported |
|---------|-----------|
| Headings | ✓ |
| Lists | ✓ |
| Code | ✓ |
| Tables | ✓ |

## Task list

- [x] Write some Markdown
- [x] Check the live preview
- [ ] Share it with your team

## Blockquote

> This is a blockquote. It can span several lines
> and is great for highlighting important information.

## Inline code

You can use \`inline code\` with backticks.

---

*Happy writing!*
`,
  es: `# Editor de Markdown

Te damos la bienvenida al **editor de Markdown**. Es compatible con GitHub Flavored Markdown.

## Funciones

- Texto en **negrita** y *cursiva*
- [Enlaces](https://example.com)
- Listas numeradas y con viñetas
- Bloques de código con resaltado de sintaxis
- Tablas y listas de tareas
- ~~Tachado~~
- ¡Y mucho más!

## Ejemplo de código

\`\`\`javascript
function saludar(nombre) {
  console.log(\`¡Hola, \${nombre}!\`);
}

saludar('mundo');
\`\`\`

## Ejemplo de tabla

| Función | Compatible |
|---------|------------|
| Encabezados | ✓ |
| Listas | ✓ |
| Código | ✓ |
| Tablas | ✓ |

## Lista de tareas

- [x] Escribir algo de Markdown
- [x] Revisar la vista previa en directo
- [ ] Compartirlo con tu equipo

## Cita

> Esto es una cita. Puede ocupar varias líneas
> y es ideal para destacar información importante.

## Código en línea

Puedes usar \`código en línea\` con acentos graves.

---

*¡Disfruta escribiendo!*
`,
};
