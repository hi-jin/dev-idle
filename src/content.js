// Game content: apps and their features, agent descriptions (spec section 7).
(function (G) {
  'use strict';

  G.content = {
    apps: {
      todo: {
        name: 'To-do App',
        letter: 'T',
        color: '#7F77DD',
        release: [
          { name: 'Add-task button', difficulty: 1, tag: 'ui' },
          { name: 'Task list view', difficulty: 1, tag: 'ui' },
          { name: 'Done checkbox', difficulty: 1, tag: 'general' },
        ],
        updates: [
          { name: 'Dark mode', difficulty: 1, tag: 'ui' },
          { name: 'Recurring tasks', difficulty: 2, tag: 'general' },
        ],
      },
      photo: {
        name: 'Photo Share',
        letter: 'P',
        color: '#D4537E',
        release: [
          { name: 'Upload button', difficulty: 1, tag: 'ui' },
          { name: 'Photo grid', difficulty: 1, tag: 'ui' },
          { name: 'Sign-in', difficulty: 2, tag: 'auth' },
          { name: 'Search by tag', difficulty: 2, tag: 'search' },
        ],
        updates: [
          { name: 'Filters', difficulty: 1, tag: 'ui' },
          { name: 'Comments', difficulty: 2, tag: 'general' },
          { name: 'Push notifications', difficulty: 3, tag: 'notify' },
        ],
      },
      shop: {
        name: 'Online Shop',
        letter: 'S',
        color: '#D85A30',
        release: [
          { name: 'Product page', difficulty: 1, tag: 'ui' },
          { name: 'Cart', difficulty: 1, tag: 'ui' },
          { name: 'Accounts', difficulty: 2, tag: 'auth' },
          { name: 'Product search', difficulty: 2, tag: 'search' },
          { name: 'Checkout and payments', difficulty: 3, tag: 'payment' },
        ],
        updates: [
          { name: 'Reviews', difficulty: 2, tag: 'general' },
          { name: 'Order notifications', difficulty: 3, tag: 'notify' },
        ],
      },
      team: {
        name: 'Team Workspace',
        letter: 'W',
        color: '#1D9E75',
        release: [
          { name: 'Workspace sign-in', difficulty: 2, tag: 'auth' },
          { name: 'Docs editor', difficulty: 2, tag: 'ui' },
          { name: 'Full-text search', difficulty: 2, tag: 'search' },
          { name: 'Mentions and alerts', difficulty: 3, tag: 'notify' },
          { name: 'Billing', difficulty: 3, tag: 'payment' },
          { name: 'Real-time co-editing', difficulty: 4, tag: 'realtime' },
        ],
        updates: [
          { name: 'Permissions', difficulty: 2, tag: 'auth' },
          { name: 'Integrations', difficulty: 3, tag: 'general' },
          { name: 'Live cursors', difficulty: 4, tag: 'realtime' },
        ],
      },
      ai: {
        name: 'AI Service',
        letter: 'AI',
        color: '#378ADD',
        release: [
          { name: 'API keys and auth', difficulty: 2, tag: 'auth' },
          { name: 'Usage dashboard', difficulty: 2, tag: 'ui' },
          { name: 'Billing', difficulty: 3, tag: 'payment' },
          { name: 'Streaming responses', difficulty: 3, tag: 'realtime' },
          { name: 'Rate limiting', difficulty: 3, tag: 'general' },
          { name: 'Recommendation model', difficulty: 4, tag: 'ai' },
          { name: 'Fine-tuning pipeline', difficulty: 4, tag: 'ai' },
        ],
        updates: [
          { name: 'Eval suite', difficulty: 3, tag: 'ai' },
          { name: 'Agent mode', difficulty: 4, tag: 'ai' },
        ],
      },
    },

    agents: {
      auto: {
        name: 'Autocomplete Bot',
        style: 'Tab-tab-tab',
        blurb: 'Cheap. Only reliable on easy tasks.',
      },
      bulk: {
        name: 'Bulk Agent',
        style: 'Codex-style',
        blurb: 'Works on three tasks at once. Often fumbles hard tasks.',
      },
      precise: {
        name: 'Precise Agent',
        style: 'Claude-style',
        blurb: 'Fast, and nails hard tasks.',
      },
      longctx: {
        name: 'Long-Context Agent',
        style: 'Reads everything',
        blurb: 'A huge context window, so it almost never slows down. Two tasks at once.',
      },
      local: {
        name: 'Local OSS Model',
        style: 'Runs on your desk',
        blurb: 'Never fills up. Gets stronger as you upgrade your hardware.',
      },
    },

    // Rival companies on LinkedIt (spec 7.5). Valuation = base x (1 + growth)^(minutes this run).
    npcs: [
      { id: 'n1', name: 'Todoly', base: 1e4, growth: 0.012 },
      { id: 'n2', name: 'Picnest', base: 2.5e4, growth: 0.011 },
      { id: 'n3', name: 'Nimbus Notes', base: 6e4, growth: 0.01 },
      { id: 'n4', name: 'Pixelpost', base: 1.5e5, growth: 0.013 },
      { id: 'n5', name: 'Cartwheel', base: 3e5, growth: 0.009 },
      { id: 'n6', name: 'Diffly', base: 5e5, growth: 0.015 },
      { id: 'n7', name: 'Stacksy', base: 8e5, growth: 0.008 },
      { id: 'n8', name: 'Shipfast', base: 1.5e6, growth: 0.012 },
      { id: 'n9', name: 'Loopline', base: 3e6, growth: 0.007 },
      { id: 'n10', name: 'Docuverse', base: 6e6, growth: 0.01 },
      { id: 'n11', name: 'Kanbanana', base: 1e7, growth: 0.006 },
      { id: 'n12', name: 'Paywise', base: 2e7, growth: 0.009 },
      { id: 'n13', name: 'Huddleup', base: 3.5e7, growth: 0.005 },
      { id: 'n14', name: 'Searchly', base: 6e7, growth: 0.008 },
      { id: 'n15', name: 'Promptworks', base: 1e8, growth: 0.006 },
      { id: 'n16', name: 'Cloudnine Labs', base: 1.5e8, growth: 0.004 },
      { id: 'n17', name: 'Agentic Inc.', base: 2.2e8, growth: 0.005 },
      { id: 'n18', name: 'Modelmart', base: 3e8, growth: 0.003 },
      { id: 'n19', name: 'Bytewave', base: 4e8, growth: 0.002 },
      { id: 'n20', name: 'Megacorp AI', base: 5e8, growth: 0.002 },
    ],

    // Achievements (spec 7.6). Rewards stay across exits.
    achievements: [
      { id: 'firstRelease', name: 'First release', tier: 'bronze', reward: { revenue: 0.02 } },
      { id: 'firstAgent', name: 'First coworker', tier: 'bronze', reward: { revenue: 0.01 } },
      { id: 'caffeineAddict', name: 'Caffeine addict', tier: 'bronze', reward: { typing: 0.05 } },
      { id: 'cpm400', name: '400 per minute', tier: 'silver', reward: { typing: 0.1 } },
      { id: 'perfectSummary', name: 'Perfect summary', tier: 'bronze', reward: { compactZone: 0.05 } },
      { id: 'summaryMaster', name: 'Summary master', tier: 'gold', reward: { accuracy: 0.02 } },
      { id: 'noOutageHour', name: 'Ten minutes without outages', tier: 'silver', reward: { revenue: 0.03 } },
      { id: 'justAcceptedAll', name: 'I just clicked Accept All', tier: 'silver', reward: { acceptAllSpeed: 0.1 } },
      { id: 'collector', name: 'Agent collector', tier: 'silver', reward: { revenue: 0.05 } },
      { id: 'firefighter', name: 'Firefighter', tier: 'bronze', reward: { updateEffect: 0.1 } },
      { id: 'bugHunter', name: 'Bug hunter', tier: 'silver', reward: { bugs: 0.05 } },
      { id: 'promptEngineer', name: 'Prompt engineer', tier: 'bronze', reward: { accuracy: 0.01 } },
      { id: 'carefulReviewer', name: 'Careful reviewer', tier: 'silver', reward: { bugs: 0.05 } },
      { id: 'national', name: 'Going national', tier: 'silver', reward: { revenue: 0.05 } },
      { id: 'global', name: 'Going global', tier: 'gold', reward: { revenue: 0.1 } },
      { id: 'firstExit', name: 'First exit', tier: 'gold', reward: { points: 0.1 } },
      { id: 'serialFounder', name: 'Serial founder', tier: 'gold', reward: { startCash: 1 } },
    ],

    // Used when code-dump/snippets.js is missing.
    fallbackSnippet: {
      id: 'fallback',
      tag: 'general',
      src: -1,
      file: 'hello.js',
      start: 1,
      text: 'function hello(name) {\n  return `Hello, ${name}!`;\n}\n\nmodule.exports = hello;\n',
    },
  };
})(window.Game = window.Game || {});
