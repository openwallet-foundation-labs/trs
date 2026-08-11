// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Trust Resolver System',
  tagline: 'A unified TRQP interface across trust protocols',
  favicon: 'img/favicon.ico',

  url: 'https://openwallet-foundation-labs.github.io',
  baseUrl: '/trs/',

  organizationName: 'openwallet-foundation-labs',
  projectName: 'trs',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/', // docs are the site root
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/openwallet-foundation-labs/trs/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'TRS',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://github.com/openwallet-foundation-labs/trs',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Project',
            items: [
              {label: 'GitHub', href: 'https://github.com/openwallet-foundation-labs/trs'},
              {label: 'Issues', href: 'https://github.com/openwallet-foundation-labs/trs/issues'},
            ],
          },
          {
            title: 'Reference',
            items: [
              {
                label: 'TRQP specification',
                href: 'https://trustoverip.github.io/tswg-trust-registry-protocol',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} OpenWallet Foundation. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
