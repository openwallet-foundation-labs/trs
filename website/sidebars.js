// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'How it works',
      collapsed: false,
      items: ['how-it-works/overview', 'how-it-works/adapters', 'how-it-works/caching'],
    },
    {
      type: 'category',
      label: 'Contributing',
      collapsed: false,
      items: [
        'contributing/getting-started',
        'contributing/adding-an-adapter',
        'contributing/conventions',
      ],
    },
  ],
};

export default sidebars;
