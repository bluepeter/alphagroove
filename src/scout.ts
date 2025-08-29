#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { LlmConfirmationScreen } from './screens/llm-confirmation.screen';
import { loadConfig } from './utils/config';
import { EnrichedSignal, LLMScreenConfig } from './screens/types';

// Initialize command line interface
const program = new Command();

program
  .name('scout')
  .description(
    'AlphaGroove Entry Scout - On-demand entry analysis for real-time and historical market conditions'
  )
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

    // Check if LLM configuration exists (check both new and legacy locations)
    const llmConfig = rawConfig.shared?.llmConfirmationScreen || rawConfig.llmConfirmationScreen;
    if (!llmConfig) {
      console.error(chalk.red(`Error: LLM configuration not found in config file.`));
      console.log(
        chalk.yellow(
          `Make sure 'shared.llmConfirmationScreen' is configured in your alphagroove.config.yaml`
        )
      );
      process.exit(1);
    }

    // Initialize LLM screen
    const llmScreenConfig = llmConfig as LLMScreenConfig;
    const llmScreen = new LlmConfirmationScreen();

    // Create a mock signal
    const cliDirection = options.direction === 'short' ? 'short' : 'long';
    let signalDirectionForLogic: 'long' | 'short' | undefined = cliDirection;
    let displayDirection = cliDirection.toUpperCase();

    const configDirection = rawConfig.shared?.direction || rawConfig.default?.direction;
    if (configDirection === 'llm_decides') {
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

    if (decision.confidence !== undefined) {
      console.log(`Average confidence: ${decision.confidence.toFixed(2)}`);
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

        if (response.action === 'long' || response.action === 'short') {
          if (typeof response.stopLoss === 'number') {
            console.log(chalk.magenta(`  Stop Loss: ${response.stopLoss.toFixed(2)}`));
          }
          if (typeof response.profitTarget === 'number') {
            console.log(chalk.magenta(`  Profit Target: ${response.profitTarget.toFixed(2)}`));
          }
        }

        if (response.confidence !== undefined) {
          console.log(`Confidence: ${response.confidence}`);
        }

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
        console.log(chalk.cyan(`\n--- Response #${index + 1} Raw Data ---`));
        if (response.debugRawText) {
          console.log(chalk.gray(response.debugRawText));
        } else {
          console.log(chalk.gray('Raw text not available.'));
        }
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
