#!/usr/bin/env node

import { spawn } from 'child_process';

import { findExtraNodeOptions } from './node-options';

const env = process.env;
const nodeOptions = env.NODE_OPTIONS ?? '';
const hasExplicitMemoryLimit = nodeOptions
	.split(/\s/)
	.some(nodeOption => /^--max-old-space-size(=\d+)?/.test(nodeOption));
if (!hasExplicitMemoryLimit) {
	const extraNodeOptions = findExtraNodeOptions();
	env.NODE_OPTIONS = `${nodeOptions} ${extraNodeOptions}`;
}

spawn(process.execPath, process.argv.slice(2), {env, stdio: 'inherit'});
