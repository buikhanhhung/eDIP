import { Injectable, Logger } from '@nestjs/common';
import type { TokenPurpose } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

/** Tool names, as the features layer declares them, mapped to what they are for. */
const TOOL_PURPOSES: Record<string, TokenPurpose> = {
  record_document_analysis: 'analysis',
  extract_named_entities: 'entities',
  verify_entities_and_extract_relationships: 'entities',
};

export interface TokenReading {
  provider: 'gemini' | 'openai' | 'bedrock';
  model: string;
  purpose: TokenPurpose;
  /** Undefined when the provider reported nothing, which is recorded as such. */
  inputTokens?: number;
  outputTokens?: number;
  /** Counted locally, for providers that report no tokens at all. */
  inputChars?: number;
}

/**
 * Records what each model call cost, so the overview can say where the budget
 * went rather than that some was spent.
 *
 * Writes are fired without being awaited and their failures are swallowed, for
 * the same reason the audit trail is: metering is a record of the work, never a
 * precondition for it. A failing insert must not turn a successful answer into
 * an error the reader sees.
 */
@Injectable()
export class TokenMeterService {
  private readonly logger = new Logger(TokenMeterService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(reading: TokenReading): void {
    const reported = reading.inputTokens !== undefined || reading.outputTokens !== undefined;

    void this.prisma.tokenUsage
      .create({
        data: {
          provider: reading.provider,
          model: reading.model,
          purpose: reading.purpose,
          inputTokens: reading.inputTokens ?? 0,
          outputTokens: reading.outputTokens ?? 0,
          inputChars: reading.inputChars ?? 0,
          reported,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(`could not record token usage: ${(error as Error).message}`);
      });
  }

  /**
   * Which job a tool call belongs to.
   *
   * The map lives here rather than in each adapter so all three providers
   * classify the same call the same way. An unrecognised tool is recorded under
   * `analysis` — a new tool should show up somewhere rather than vanish, and
   * the log line names it so the map can be extended.
   */
  purposeForTool(toolName: string): TokenPurpose {
    const purpose = TOOL_PURPOSES[toolName];
    if (purpose) return purpose;

    this.logger.warn(`no token purpose mapped for tool "${toolName}"; recording as analysis`);
    return 'analysis';
  }
}
