#!/usr/bin/env node

/**
 * AlphaGroove On-Demand LLM Chart Analyzer
 *
 * This tool allows you to analyze charts with the LLM setup
 * defined in alphagroove.config.yaml without running a full backtest.
 *
 * Usage:
 *   pnpm llm-analyze /path/to/chart.png [--direction <long|short>]
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { LlmApiService } from './services/llm-api.service';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';
import { loadConfig } from './utils/config';
import { EnrichedSignal, LLMScreenConfig } from './screens/types';

// Initialize command line interface
const program = new Command();

program
  .name('llm-analyze')
  .description("Analyze a chart image using AlphaGroove's LLM configuration")
  .argument('<imagePath>', 'Path to the chart image to analyze')
  .option('-d, --direction <direction>', 'Suggested direction (long or short)', 'long')
  .option('-c, --config <path>', 'Path to configuration file (default: alphagroove.config.yaml)')
  .option('--ticker <symbol>', 'Ticker symbol (for logging only)')
  .option('--date <YYYY-MM-DD>', 'Trade date (for logging only)')
  .option('--price <number>', 'Current price (for logging only)')
  .option('-v, --verbose', 'Show detailed LLM responses including rationales');

program.parse(process.argv);

/**
 * Main function to run the analysis
 */
export async function main(imagePath?: string, cmdOptions?: any) {
  try {
    // Use provided path and options or get from program
    const chartPath = imagePath || program.args[0];
    const options = cmdOptions || program.opts();

    // Check if image exists
    if (!fs.existsSync(chartPath)) {
      console.error(chalk.red(`Error: Image file not found at ${chartPath}`));
      process.exit(1);
    }

    // Load config
    console.log(chalk.dim('Loading configuration...'));
    const rawConfig = loadConfig(options.config);

    // Check if LLM configuration exists
    if (!rawConfig.llmConfirmationScreen || !rawConfig.llmConfirmationScreen.enabled) {
      console.error(chalk.red(`Error: LLM configuration not found or not enabled in config file.`));
      console.log(
        chalk.yellow(
          `Make sure 'llmConfirmationScreen.enabled' is set to true in your alphagroove.config.yaml`
        )
      );
      process.exit(1);
    }

    // Initialize LLM screen
    const llmScreenConfig = rawConfig.llmConfirmationScreen as LLMScreenConfig;
    const llmScreen = new LlmConfirmationScreen();

    // Create a mock signal
    const cliDirection = options.direction === 'short' ? 'short' : 'long';
    let signalDirectionForLogic: 'long' | 'short' | undefined = cliDirection;
    let displayDirection = cliDirection.toUpperCase();

    if (rawConfig.default?.direction === 'llm_decides') {
      signalDirectionForLogic = undefined; // LLM screen will use its logic to determine direction
      displayDirection = 'LLM Decides';
    }

    const ticker = options.ticker || 'TICKER';
    const tradeDate = options.date || new Date().toISOString().split('T')[0];
    const price = options.price ? parseFloat(options.price) : 100.0;

    const signal: EnrichedSignal = {
      ticker,
      trade_date: tradeDate,
      price,
      timestamp: `${tradeDate} ${new Date().toTimeString().split(' ')[0]}`,
      type: 'entry',
      direction: signalDirectionForLogic, // Use the type-corrected direction
    };

    // Print analysis info
    console.log(chalk.bold(`\nAnalyzing chart: ${path.basename(chartPath)}`));
    console.log(chalk.dim(`Direction: ${displayDirection}`)); // Use displayDirection
    console.log(chalk.dim(`Model: ${llmScreenConfig.modelName}`));
    console.log(chalk.dim(`Calls: ${llmScreenConfig.numCalls}`));
    console.log(chalk.dim(`Threshold: ${llmScreenConfig.agreementThreshold}`));
    console.log(chalk.dim('───────────────────────────────────────────────────'));

    // Call LLM screen directly
    const decision = await llmScreen.shouldSignalProceed(
      signal,
      chartPath,
      llmScreenConfig,
      rawConfig
    );

    // Determine if the analysis supports the signal direction
    let supportsSuggestedDirection = false;
    if (rawConfig.default?.direction === 'llm_decides') {
      // If LLM decides, any outcome from LLM is implicitly "supported" in terms of initial setup
      supportsSuggestedDirection = !!decision.direction;
    } else {
      supportsSuggestedDirection = decision.direction === cliDirection;
    }

    // Print results
    console.log(chalk.bold('\nLLM Analysis Results:'));
    console.log(`Proceed with trade: ${decision.proceed ? chalk.green('YES') : chalk.red('NO')}`);

    if (decision.direction) {
      console.log(
        `Suggested direction: ${
          decision.direction === 'long' ? chalk.green('LONG ↗️') : chalk.red('SHORT ↘️')
        }`
      );
    }

    if (options.direction && decision.direction) {
      if (rawConfig.default?.direction !== 'llm_decides') {
        const match =
          decision.direction === cliDirection
            ? chalk.green('✓ MATCHES')
            : chalk.red('✗ DIFFERS FROM');
        console.log(`${match} your suggested ${cliDirection.toUpperCase()} direction`);
      }
    }

    if (decision.rationale) {
      console.log(`\nRationale: ${chalk.italic(decision.rationale)}`);
    }

    // Show individual LLM responses always
    if (decision._debug?.responses) {
      console.log(chalk.bold('\nIndividual LLM Responses:'));

      decision._debug.responses.forEach((response, index) => {
        const actionEmoji =
          response.action === 'long' ? '🔼' : response.action === 'short' ? '🔽' : '⏸️';

        console.log(
          chalk.cyan(`Response #${index + 1}: ${actionEmoji} ${response.action.toUpperCase()}`)
        );

        if (response.rationalization) {
          console.log(`"${response.rationalization}"`);
        }

        if (response.error) {
          console.log(chalk.red(`Error: ${response.error}`));
        }
      });
    }

    if (typeof decision.cost === 'number') {
      console.log(chalk.dim(`\nLLM Cost: $${decision.cost.toFixed(6)}`));
    }

    // If verbose, print additional details
    if (options.verbose && decision._debug?.responses) {
      console.log(chalk.bold('\nDetailed LLM Response Data:'));

      decision._debug.responses.forEach((response, index) => {
        if (typeof response.cost === 'number') {
          console.log(chalk.dim(`Response #${index + 1} Cost: $${response.cost.toFixed(6)}`));
        }
      });
    }
  } catch (error) {
    console.error(chalk.red('Error analyzing chart:'), error);
    process.exit(1);
  }
}

// Run only if executed directly (not when imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
