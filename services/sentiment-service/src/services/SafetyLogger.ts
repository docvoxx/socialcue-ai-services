import { SafetyViolation } from '@socialcue-ai-services/shared';
import { logger } from '@socialcue-ai-services/shared';

export interface SafetyLogEntry {
  timestamp: Date;
  request_id: string;
  user_id?: string | undefined;
  violation: SafetyViolation;
  context: string;
  action_taken: 'blocked' | 'flagged' | 'rewritten';
  original_text: string;
}

export class SafetyLogger {
  private logEntries: SafetyLogEntry[] = [];
  
  /**
   * Logs safety interventions for compliance and improvement purposes
   * Implements Requirement 4.8: Log all safety interventions
   */
  logSafetyIntervention(
    requestId: string,
    violation: SafetyViolation,
    context: string,
    actionTaken: 'blocked' | 'flagged' | 'rewritten',
    originalText: string,
    userId?: string
  ): void {
    const logEntry: SafetyLogEntry = {
      timestamp: new Date(),
      request_id: requestId,
      user_id: userId,
      violation,
      context,
      action_taken: actionTaken,
      original_text: this.sanitizeForLogging(originalText),
    };

    // Store in memory (in production, this would go to a database)
    this.logEntries.push(logEntry);

    // Log to structured logging system
    logger.warn('Safety intervention logged', {
      service: 'sentiment-service',
      request_id: requestId,
      violation_type: violation.violation_type,
      severity: violation.severity,
      action_taken: actionTaken,
      candidate_id: violation.candidate_id,
      // Don't log full text for privacy, just metadata
      text_length: originalText.length,
      has_user_id: !!userId,
    });

    // Alert on high-severity violations
    if (violation.severity === 'high') {
      this.alertHighSeverityViolation(logEntry);
    }
  }

  /**
   * Gets safety statistics for monitoring and compliance reporting
   */
  getSafetyStats(timeRange?: { start: Date; end: Date }) {
    let entries = this.logEntries;
    
    if (timeRange) {
      entries = entries.filter(entry => 
        entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end
      );
    }

    const violationsByType = entries.reduce((acc, entry) => {
      const type = entry.violation.violation_type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const violationsBySeverity = entries.reduce((acc, entry) => {
      const severity = entry.violation.severity;
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const actionsTaken = entries.reduce((acc, entry) => {
      const action = entry.action_taken;
      acc[action] = (acc[action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total_violations: entries.length,
      violations_by_type: violationsByType,
      violations_by_severity: violationsBySeverity,
      actions_taken: actionsTaken,
      time_range: timeRange,
    };
  }

  /**
   * Exports safety logs for compliance auditing
   */
  exportSafetyLogs(timeRange?: { start: Date; end: Date }): SafetyLogEntry[] {
    let entries = this.logEntries;
    
    if (timeRange) {
      entries = entries.filter(entry => 
        entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end
      );
    }

    // Return sanitized entries (remove sensitive data)
    return entries.map(entry => ({
      ...entry,
      user_id: entry.user_id ? '[REDACTED]' : undefined,
      original_text: '[REDACTED]', // Don't export original text for privacy
    })) as SafetyLogEntry[];
  }

  /**
   * Checks if there are concerning patterns in safety violations
   */
  detectSafetyPatterns(): Array<{
    pattern: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    count: number;
  }> {
    const patterns: Array<{
      pattern: string;
      severity: 'low' | 'medium' | 'high';
      description: string;
      count: number;
    }> = [];

    const recentEntries = this.logEntries.filter(
      entry => entry.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    );

    // Check for high frequency of violations
    if (recentEntries.length > 50) {
      patterns.push({
        pattern: 'high_violation_frequency',
        severity: 'high',
        description: `${recentEntries.length} safety violations in the last 24 hours`,
        count: recentEntries.length,
      });
    }

    // Check for repeated prompt injection attempts
    const promptInjectionCount = recentEntries.filter(
      entry => entry.violation.violation_type === 'prompt_injection'
    ).length;

    if (promptInjectionCount > 10) {
      patterns.push({
        pattern: 'prompt_injection_attacks',
        severity: 'high',
        description: `${promptInjectionCount} prompt injection attempts in the last 24 hours`,
        count: promptInjectionCount,
      });
    }

    // Check for repeated violations from same user
    const userViolations = recentEntries.reduce((acc, entry) => {
      if (entry.user_id) {
        acc[entry.user_id] = (acc[entry.user_id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    for (const [_userId, count] of Object.entries(userViolations)) {
      if (count > 5) {
        patterns.push({
          pattern: 'repeated_user_violations',
          severity: 'medium',
          description: `User has ${count} violations in the last 24 hours`,
          count,
        });
      }
    }

    return patterns;
  }

  private sanitizeForLogging(text: string): string {
    // Remove potential PII and limit length for logging
    let sanitized = text.replace(/\b\d{10,}\b/g, '[PHONE]'); // Phone numbers
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]'); // Emails
    
    // Limit length
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100) + '...';
    }
    
    return sanitized;
  }

  private alertHighSeverityViolation(logEntry: SafetyLogEntry): void {
    logger.error('HIGH SEVERITY SAFETY VIOLATION DETECTED', new Error('High severity safety violation'), {
      service: 'sentiment-service',
      request_id: logEntry.request_id,
      violation_type: logEntry.violation.violation_type,
      severity: logEntry.violation.severity,
      candidate_id: logEntry.violation.candidate_id,
      action_taken: logEntry.action_taken,
      timestamp: logEntry.timestamp,
    });

    // In production, this would trigger alerts to security team
    // For now, we just log it with high priority
  }

  /**
   * Clears old log entries to prevent memory issues
   * In production, this would archive to persistent storage
   */
  cleanupOldLogs(retentionDays: number = 30): void {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const originalCount = this.logEntries.length;
    
    this.logEntries = this.logEntries.filter(entry => entry.timestamp > cutoffDate);
    
    const removedCount = originalCount - this.logEntries.length;
    
    if (removedCount > 0) {
      logger.info('Cleaned up old safety logs', {
        service: 'sentiment-service',
        removed_count: removedCount,
        remaining_count: this.logEntries.length,
        cutoff_date: cutoffDate,
      });
    }
  }
}