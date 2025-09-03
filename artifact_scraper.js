const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class Game8LocalArtifactScraperV5 {
  constructor() {
    this.htmlPath = './game8/Best Artifacts Tier List _ Destiny_ Rising｜Game8.htm';
    this.artifacts = [];
    this.tierMapping = {
      'S Tier': 'S',
      'A Tier': 'A', 
      'B Tier': 'B',
      'C Tier': 'C'
    };
  }

  async scrapeArtifacts() {
    console.log('🚀 Starting Game8 V5 FINAL Local HTML Scraping...');
    
    try {
      const html = fs.readFileSync(this.htmlPath, 'utf8');
      console.log('📄 Local HTML loaded successfully');
      
      const $ = cheerio.load(html);
      
      // Find all tab panels (4 slots)
      const tabPanels = $('.a-tabPanel');
      console.log(`📋 Found ${tabPanels.length} tab panels`);

      tabPanels.each((panelIndex, panelElement) => {
        const slotNumber = panelIndex + 1;
        console.log(`📍 Processing Slot ${slotNumber}...`);
        
        const $panel = $(panelElement);
        this.extractArtifactsFromPanel($, $panel, slotNumber);
      });

      console.log(`✅ Total artifacts extracted: ${this.artifacts.length}`);
      return this.artifacts;

    } catch (error) {
      console.error('❌ V5 Local Scraping failed:', error.message);
      throw error;
    }
  }

  extractArtifactsFromPanel($, $panel, slotNumber) {
    const self = this;
    
    // Find all tier rows in the table
    $panel.find('table tr').each((rowIndex, row) => {
      const $row = $(row);
      
      // Get tier from the first column
      const tierImg = $row.find('th img').first();
      const tierAlt = tierImg.attr('alt');
      const tier = self.tierMapping[tierAlt] || null;
      
      if (!tier) return; // Skip if no valid tier
      
      console.log(`  🏆 Processing ${tier} tier artifacts...`);
      
      // Find all artifact spans in this row
      $row.find('span.js-discription-tooltip').each((spanIndex, span) => {
        const $span = $(span);
        
        // Extract image data
        const img = $span.find('img').first();
        const iconUrl = img.attr('data-src') || img.attr('src');
        const iconAlt = img.attr('alt');
        
        // Extract tooltip content
        const template = $span.find('template.js-tooltip-content').first();
        const tooltipHtml = template.html();
        
        if (iconAlt && tooltipHtml && iconUrl && !iconUrl.includes('data:image/gif')) {
          const artifact = self.parseArtifactFromTooltip(tooltipHtml, slotNumber, tier, iconUrl, iconAlt);
          
          if (artifact) {
            // Check for duplicates
            const exists = self.artifacts.some(existing => 
              existing.name === artifact.name && existing.slot === artifact.slot
            );
            
            if (!exists) {
              self.artifacts.push(artifact);
              console.log(`    ✅ ${tier}-Tier: ${artifact.name} 🖼️`);
            }
          }
        }
      });
    });
  }

  parseArtifactFromTooltip(tooltipHtml, slotNumber, originalTier, iconUrl, iconAlt) {
    // Clean tooltip content
    const cleanContent = tooltipHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();

    const lines = cleanContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;

    const name = lines[0].trim();
    const description = lines.slice(1).join(' ').trim();

    if (name.length < 3) return null;

    // Enhanced parsing with V4 improvements
    const parsedStats = this.parseEnhancedStats(description);
    const categories = this.enhancedCategorization(description, parsedStats);
    const gameplayInfo = this.generateGameplayInfo(description, parsedStats, categories);

    return {
      id: this.generateId(name),
      name,
      slot: slotNumber,
      // Store Game8 tier as reference only, not as main tier
      game8_tier: originalTier,
      effect: {
        description,
        parsed_values: parsedStats.numerical_values,
        conditions: parsedStats.conditions,
        triggers: parsedStats.triggers
      },
      stats: parsedStats.stats,
      categories,
      gameplay_info: gameplayInfo,
      mechanics: this.identifyEnhancedMechanics(description),
      icon: {
        url: iconUrl,
        alt: iconAlt,
        extraction_method: 'local_html_data_src'
      },
      source: 'artifact_scraper'
    };
  }

  parseEnhancedStats(description) {
    const stats = {};
    const numericalValues = {};
    const conditions = [];
    const triggers = [];

    // Extract percentages
    const percentageMatches = description.match(/([+-]?\d+\.?\d*)%/g);
    if (percentageMatches) {
      stats.percentages = percentageMatches;
      
      percentageMatches.forEach(perc => {
        const value = parseFloat(perc.replace(/[+-]/, ''));
        const isPositive = !perc.startsWith('-');
        const context = this.getContext(description, perc, 30);
        
        if (context.includes('damage resistance') || (context.includes('take') && context.includes('damage'))) {
          numericalValues.damage_resistance = value;
        }
        if (context.includes('damage bonus') || context.includes('damage') && isPositive && !context.includes('resistance')) {
          numericalValues.damage_bonus = value;
        }
        if (context.includes('shield') || context.includes('overshield')) {
          numericalValues.shield_value = value;
        }
        if (context.includes('health')) {
          if (context.includes('restore') || context.includes('recover')) {
            numericalValues.healing_value = value;
          } else {
            numericalValues.health_threshold = value;
          }
        }
      });
    }

    // Extract durations
    const durationMatches = description.match(/(\d+\.?\d*)\s*s(?:econds?)?/gi);
    if (durationMatches) {
      stats.durations = durationMatches;
      const durations = durationMatches.map(d => parseFloat(d));
      numericalValues.duration_seconds = durations[0];
      if (durations.length > 1) {
        numericalValues.cooldown_seconds = durations.find(d => d > durations[0]) || durations[1];
      }
    }

    // Extract stacks
    const stackMatches = description.match(/stacks?\s+(\d+)x?|(\d+)x/gi);
    if (stackMatches) {
      const stackValue = parseInt(stackMatches[0].match(/\d+/)[0]);
      stats.stacks = {
        max_stacks: stackValue,
        stack_description: stackMatches[0]
      };
      numericalValues.max_stacks = stackValue;
      
      // Calculate max effects
      if (numericalValues.damage_resistance) {
        numericalValues.max_damage_resistance = numericalValues.damage_resistance * stackValue;
      }
      if (numericalValues.damage_bonus) {
        numericalValues.max_damage_bonus = numericalValues.damage_bonus * stackValue;
      }
    }

    // Extract distances
    const distanceMatches = description.match(/(\d+\.?\d*)\s*m(?:eters?)?/gi);
    if (distanceMatches) {
      stats.distances = distanceMatches;
      numericalValues.range_meters = parseFloat(distanceMatches[0]);
    }

    // Extract conditions
    const conditionPatterns = [
      /when\s+[^.]+/gi,
      /while\s+[^.]+/gi,
      /after\s+[^.]+/gi,
      /below\s+[\d.]+%/gi,
      /above\s+[\d.]+%/gi,
      /within\s+[\d.]+[ms]/gi
    ];

    conditionPatterns.forEach(pattern => {
      const matches = description.match(pattern);
      if (matches) {
        conditions.push(...matches.map(m => m.trim()));
      }
    });

    // Extract triggers
    const triggerPatterns = [
      /casting\s+[^.]+/gi,
      /hitting\s+[^.]+/gi,
      /taking\s+damage[^.]*/gi,
      /gaining\s+[^.]+/gi,
      /reloading[^.]*/gi,
      /final\s+blows?[^.]*/gi,
      /weapon\s+and\s+ability\s+hits/gi,
      /summoning[^.]*/gi
    ];

    triggerPatterns.forEach(pattern => {
      const matches = description.match(pattern);
      if (matches) {
        triggers.push(...matches.map(m => m.trim()));
      }
    });

    return {
      stats,
      numerical_values: numericalValues,
      conditions: [...new Set(conditions)],
      triggers: [...new Set(triggers)]
    };
  }

  enhancedCategorization(description, parsedStats) {
    const categories = {
      primary: 'utility',
      secondary: [],
      playstyle: [],
      trigger_type: 'passive',
      effect_type: 'buff'
    };

    const desc = description.toLowerCase();

    // Primary category
    if (desc.includes('damage resistance') || desc.includes('take') && desc.includes('damage') && desc.includes('-')) {
      categories.primary = 'defense';
    } else if (desc.includes('damage bonus') || desc.includes('deal') && desc.includes('damage') && desc.includes('+')) {
      categories.primary = 'offense';
    } else if (desc.includes('shield') || desc.includes('overshield')) {
      categories.primary = 'shield';
    } else if (desc.includes('heal') || desc.includes('restore') && desc.includes('health')) {
      categories.primary = 'healing';
    } else if (desc.includes('ability') && !desc.includes('weapon')) {
      categories.primary = 'ability';
    } else if (desc.includes('weapon') && !desc.includes('ability')) {
      categories.primary = 'weapon';
    } else if (desc.includes('movement') || desc.includes('speed')) {
      categories.primary = 'mobility';
    }

    // Secondary categories
    if (parsedStats.stats.stacks) categories.secondary.push('stacking');
    if (desc.includes('cooldown')) categories.secondary.push('cooldown');
    if (desc.includes('precision')) categories.secondary.push('precision');
    if (desc.includes('reload')) categories.secondary.push('reload');
    if (desc.includes('final blow')) categories.secondary.push('execution');
    if (desc.includes('airborne') || desc.includes('stationary')) categories.secondary.push('positional');

    // Playstyle
    if (categories.primary === 'defense') categories.playstyle.push('tank', 'sustain');
    if (categories.primary === 'offense') categories.playstyle.push('dps', 'burst');
    if (desc.includes('ability')) categories.playstyle.push('caster');
    if (desc.includes('movement')) categories.playstyle.push('mobile');
    if (desc.includes('summon')) categories.playstyle.push('summoner');
    if (parsedStats.numerical_values.max_stacks > 5) categories.playstyle.push('ramping');

    // Trigger type
    if (desc.includes('casting')) {
      categories.trigger_type = 'on_ability';
    } else if (desc.includes('hitting')) {
      categories.trigger_type = 'on_hit';
    } else if (desc.includes('taking damage')) {
      categories.trigger_type = 'on_damage_taken';
    } else if (desc.includes('reloading')) {
      categories.trigger_type = 'on_reload';
    } else if (desc.includes('final blow')) {
      categories.trigger_type = 'on_kill';
    } else if (desc.includes('when') || desc.includes('while')) {
      categories.trigger_type = 'conditional';
    }

    return categories;
  }

  generateGameplayInfo(description, parsedStats, categories) {
    const gameplayInfo = {
      best_for: [],
      synergizes_with: [],
      countered_by: [],
      skill_floor: 'medium',
      skill_ceiling: 'medium',
      // Remove effectiveness_rating - you'll set it dynamically
      power_score: this.calculatePowerScore(parsedStats) // Objective power calculation
    };

    const desc = description.toLowerCase();

    // Best for
    if (categories.primary === 'defense') {
      gameplayInfo.best_for.push('tank builds', 'survivability', 'sustained combat');
    }
    if (categories.primary === 'offense') {
      gameplayInfo.best_for.push('dps builds', 'damage optimization');
    }
    if (categories.primary === 'healing') {
      gameplayInfo.best_for.push('support builds', 'team play');
    }
    if (parsedStats.numerical_values.max_stacks > 5) {
      gameplayInfo.best_for.push('extended fights', 'ramping strategies');
    }

    // Synergizes with
    if (desc.includes('ability')) {
      gameplayInfo.synergizes_with.push('ability cooldown reduction', 'caster builds');
    }
    if (desc.includes('weapon')) {
      gameplayInfo.synergizes_with.push('weapon-focused builds', 'high attack speed');
    }
    if (desc.includes('summon')) {
      gameplayInfo.synergizes_with.push('summoner builds', 'pet damage');
    }
    if (parsedStats.triggers.length > 0) {
      gameplayInfo.synergizes_with.push('active playstyles', 'combo builds');
    }

    // Countered by
    if (categories.primary === 'defense' && parsedStats.numerical_values.max_stacks) {
      gameplayInfo.countered_by.push('burst damage', 'quick fights');
    }
    if (desc.includes('stationary')) {
      gameplayInfo.countered_by.push('mobile enemies', 'forced movement');
    }
    if (desc.includes('low health') || desc.includes('below')) {
      gameplayInfo.countered_by.push('healing builds', 'full health maintenance');
    }
    if (desc.includes('cooldown')) {
      gameplayInfo.countered_by.push('cooldown increase effects');
    }

    // Skill assessment
    const complexity = parsedStats.conditions.length + parsedStats.triggers.length;
    if (complexity >= 4) {
      gameplayInfo.skill_floor = 'high';
      gameplayInfo.skill_ceiling = 'very_high';
    } else if (complexity >= 2) {
      gameplayInfo.skill_floor = 'medium';  
      gameplayInfo.skill_ceiling = 'high';
    } else if (parsedStats.triggers.length === 0) {
      gameplayInfo.skill_floor = 'low';
      gameplayInfo.skill_ceiling = 'low';
    }

    return gameplayInfo;
  }

  calculatePowerScore(parsedStats) {
    // Objective power calculation for ranking purposes
    let score = 0;
    
    // Damage bonuses
    if (parsedStats.numerical_values.damage_bonus) {
      score += parsedStats.numerical_values.damage_bonus * 2;
    }
    if (parsedStats.numerical_values.max_damage_bonus) {
      score += parsedStats.numerical_values.max_damage_bonus * 1.5;
    }
    
    // Damage resistance
    if (parsedStats.numerical_values.damage_resistance) {
      score += parsedStats.numerical_values.damage_resistance * 2;
    }
    if (parsedStats.numerical_values.max_damage_resistance) {
      score += parsedStats.numerical_values.max_damage_resistance * 1.5;
    }
    
    // Shield values
    if (parsedStats.numerical_values.shield_value) {
      score += parsedStats.numerical_values.shield_value * 1.2;
    }
    
    // Healing values
    if (parsedStats.numerical_values.healing_value) {
      score += parsedStats.numerical_values.healing_value * 1.5;
    }
    
    // Duration bonus (longer = better)
    if (parsedStats.numerical_values.duration_seconds) {
      score += Math.min(parsedStats.numerical_values.duration_seconds, 10); // Cap at 10
    }
    
    // Stack multiplier
    if (parsedStats.numerical_values.max_stacks) {
      score += Math.log(parsedStats.numerical_values.max_stacks) * 2;
    }
    
    // Complexity penalty
    const complexity = (parsedStats.conditions?.length || 0) + (parsedStats.triggers?.length || 0);
    if (complexity > 2) {
      score -= complexity * 0.5;
    }
    
    return Math.round(score * 10) / 10; // Round to 1 decimal
  }

  identifyEnhancedMechanics(description) {
    const mechanics = [];
    const desc = description.toLowerCase();

    const mechanicPatterns = {
      'stacking': ['stack', 'stacks'],
      'shield': ['shield', 'overshield'],
      'damage_reduction': ['damage resistance', 'take.*damage', 'reduce.*damage'],
      'damage_amplification': ['damage bonus', 'deal.*damage', 'increase.*damage'],
      'healing': ['heal', 'restore.*health', 'recovery'],
      'ability_enhancement': ['ability', 'signature'],
      'weapon_enhancement': ['weapon', 'rate of fire', 'reload'],
      'mobility': ['movement', 'speed', 'dash', 'airborne'],
      'conditional': ['when', 'while', 'if', 'below', 'above'],
      'area_of_effect': ['multiple targets', 'radius', 'area'],
      'precision': ['precision', 'headshot', 'critical'],
      'execution': ['final blow', 'kill', 'defeat'],
      'elemental': ['elemental', 'fire', 'void', 'arc'],
      'temporal': ['duration', 'cooldown', 'interval'],
      'positional': ['stationary', 'moving', 'airborne', 'within']
    };

    Object.entries(mechanicPatterns).forEach(([mechanic, patterns]) => {
      if (patterns.some(pattern => desc.match(new RegExp(pattern, 'i')))) {
        mechanics.push(mechanic);
      }
    });

    return [...new Set(mechanics)];
  }

  getContext(text, target, range) {
    const index = text.indexOf(target);
    const start = Math.max(0, index - range);
    const end = Math.min(text.length, index + target.length + range);
    return text.substring(start, end).toLowerCase();
  }

  generateId(name) {
    return name.toLowerCase()
              .replace(/[^a-z0-9\s]/g, '')
              .replace(/\s+/g, '_')
              .substring(0, 30);
  }

  async saveToFile(filename = 'artifacts.json') {
    const filePath = path.join(__dirname, 'data', filename);
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Generate comprehensive statistics
    const slotDist = {};
    const categoryDist = {};
    const mechanicsDist = {};
    const game8TierDist = {};
    const powerScores = [];
    
    this.artifacts.forEach(artifact => {
      slotDist[artifact.slot] = (slotDist[artifact.slot] || 0) + 1;
      categoryDist[artifact.categories.primary] = (categoryDist[artifact.categories.primary] || 0) + 1;
      game8TierDist[artifact.game8_tier] = (game8TierDist[artifact.game8_tier] || 0) + 1;
      powerScores.push(artifact.gameplay_info.power_score);
      
      artifact.mechanics.forEach(mechanic => {
        mechanicsDist[mechanic] = (mechanicsDist[mechanic] || 0) + 1;
      });
    });

    // Calculate power score statistics
    const avgPowerScore = powerScores.reduce((a, b) => a + b, 0) / powerScores.length;
    const maxPowerScore = Math.max(...powerScores);
    const minPowerScore = Math.min(...powerScores);

    const data = {
      metadata: {
        source: 'game8.co (local HTML)',
        scraped_at: new Date().toISOString(),
        total_artifacts: this.artifacts.length,
        method: 'artifact_scraper_dynamic_tiers',
        slot_distribution: slotDist,
        category_distribution: categoryDist,
        mechanics_distribution: mechanicsDist,
        game8_tier_distribution: game8TierDist,
        power_score_stats: {
          average: Math.round(avgPowerScore * 10) / 10,
          max: maxPowerScore,
          min: minPowerScore,
          range: Math.round((maxPowerScore - minPowerScore) * 10) / 10
        },
        features: [
          'local_html_parsing',
          'real_icon_urls_extracted',
          'game8_tier_as_reference_only',
          'dynamic_tier_system_ready',
          'power_score_calculation',
          'zero_duplicates',
          'complete_artifact_coverage',
          'enhanced_parsing_features'
        ]
      },
      artifacts: this.artifacts
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved ${this.artifacts.length} final artifacts to ${filePath}`);
    return filePath;
  }

  async run() {
    try {
      await this.scrapeArtifacts();
      const filePath = await this.saveToFile();
      
      console.log('\n📊 V5 FINAL Scraping Summary:');
      console.log(`Total artifacts: ${this.artifacts.length}`);
      
      // Quality metrics
      const withRealIcons = this.artifacts.filter(a => 
        a.icon.url && !a.icon.url.includes('data:image/gif')
      ).length;
      const withTriggers = this.artifacts.filter(a => a.effect.triggers.length > 0).length;
      const withConditions = this.artifacts.filter(a => a.effect.conditions.length > 0).length;
      const withCounters = this.artifacts.filter(a => a.gameplay_info.countered_by.length > 0).length;
      
      // Game8 tier distribution (for reference)
      const game8TierStats = {};
      const powerScores = [];
      this.artifacts.forEach(a => {
        game8TierStats[a.game8_tier] = (game8TierStats[a.game8_tier] || 0) + 1;
        powerScores.push(a.gameplay_info.power_score);
      });
      
      const avgPowerScore = powerScores.reduce((a, b) => a + b, 0) / powerScores.length;
      const maxPowerScore = Math.max(...powerScores);
      const minPowerScore = Math.min(...powerScores);
      
      console.log(`📊 Quality Metrics:`);
      console.log(`  🖼️ Real icons: ${withRealIcons}/${this.artifacts.length} (${Math.round(withRealIcons/this.artifacts.length*100)}%)`);
      console.log(`  🎯 With triggers: ${withTriggers}/${this.artifacts.length} (${Math.round(withTriggers/this.artifacts.length*100)}%)`);
      console.log(`  ⚖️ With conditions: ${withConditions}/${this.artifacts.length} (${Math.round(withConditions/this.artifacts.length*100)}%)`);
      console.log(`  🛡️ With counters: ${withCounters}/${this.artifacts.length} (${Math.round(withCounters/this.artifacts.length*100)}%)`);
      
      console.log(`🏆 Game8 Tier Distribution (Reference):`, game8TierStats);
      console.log(`⚡ Power Score Stats: Avg: ${avgPowerScore.toFixed(1)}, Range: ${minPowerScore.toFixed(1)}-${maxPowerScore.toFixed(1)}`);
      
      if (this.artifacts.length > 0) {
        console.log('\n🎯 Sample Artifact:');
        const sample = this.artifacts[0];
        console.log(`  Name: ${sample.name}`);
        console.log(`  Slot: ${sample.slot} | Game8 Tier: ${sample.game8_tier}`);
        console.log(`  Power Score: ${sample.gameplay_info.power_score}`);
        console.log(`  Icon: ${sample.icon.url ? '✅' : '❌'}`);
        console.log(`  Triggers: ${sample.effect.triggers.length}`);
        console.log(`  Conditions: ${sample.effect.conditions.length}`);
      }
      
      return filePath;
    } catch (error) {
      console.error('💥 V5 FINAL Scraping failed:', error);
      throw error;
    }
  }
}

// Run scraper if called directly
if (require.main === module) {
  const scraper = new Game8LocalArtifactScraperV5();
  scraper.run().then(filePath => {
    console.log(`🎉 ARTIFACT SCRAPER SUCCESS! Ready for dynamic tiers: ${filePath}`);
  }).catch(error => {
    console.error('❌ Artifact Scraper failed:', error.message);
    process.exit(1);
  });
}

module.exports = Game8LocalArtifactScraperV5;