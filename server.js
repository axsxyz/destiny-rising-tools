const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load artifacts data
const artifactsPath = path.join(__dirname, 'data/artifacts.json');
let artifactsData = {};

try {
  artifactsData = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
  console.log(`🎯 Loaded ${artifactsData.metadata.total_artifacts} artifacts for theorycrafting`);
} catch (error) {
  console.error('❌ Failed to load artifacts data:', error.message);
}

// API Routes

// GET /api/artifacts - Get all artifacts with optional filters
app.get('/api/artifacts', (req, res) => {
  const { slot, category, search, sort, limit } = req.query;
  
  let artifacts = Object.values(artifactsData.artifacts || []);
  
  // Filter by slot
  if (slot) {
    artifacts = artifacts.filter(a => a.slot === parseInt(slot));
  }
  
  // Filter by category
  if (category) {
    artifacts = artifacts.filter(a => a.categories.primary === category);
  }
  
  // Search by name or description
  if (search) {
    const searchLower = search.toLowerCase();
    artifacts = artifacts.filter(a => 
      a.name.toLowerCase().includes(searchLower) ||
      a.effect.description.toLowerCase().includes(searchLower)
    );
  }
  
  // Sort artifacts
  if (sort) {
    switch (sort) {
      case 'power_score':
        artifacts.sort((a, b) => (b.gameplay_info.power_score || 0) - (a.gameplay_info.power_score || 0));
        break;
      case 'name':
        artifacts.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'game8_tier':
        const tierOrder = { 'S': 4, 'A': 3, 'B': 2, 'C': 1 };
        artifacts.sort((a, b) => (tierOrder[b.game8_tier] || 0) - (tierOrder[a.game8_tier] || 0));
        break;
    }
  }
  
  // Limit results
  if (limit) {
    artifacts = artifacts.slice(0, parseInt(limit));
  }
  
  res.json({
    artifacts,
    metadata: {
      total: artifacts.length,
      filters: { slot, category, search, sort, limit }
    }
  });
});

// GET /api/artifacts/:id - Get specific artifact
app.get('/api/artifacts/:id', (req, res) => {
  const artifact = artifactsData.artifacts?.find(a => a.id === req.params.id);
  
  if (!artifact) {
    return res.status(404).json({ error: 'Artifact not found' });
  }
  
  res.json(artifact);
});

// POST /api/builds/calculate - Calculate build stats and synergies
app.post('/api/builds/calculate', (req, res) => {
  const { artifacts: artifactIds } = req.body;
  
  if (!artifactIds || !Array.isArray(artifactIds) || artifactIds.length > 4) {
    return res.status(400).json({ error: 'Invalid artifacts array (max 4)' });
  }
  
  const buildArtifacts = artifactIds
    .map(id => artifactsData.artifacts?.find(a => a.id === id))
    .filter(Boolean);
  
  // Calculate combined stats
  const combinedStats = calculateBuildStats(buildArtifacts);
  
  // Calculate synergies
  const synergies = calculateSynergies(buildArtifacts);
  
  // Calculate build score
  const buildScore = calculateBuildScore(buildArtifacts, combinedStats, synergies);
  
  res.json({
    artifacts: buildArtifacts,
    combined_stats: combinedStats,
    synergies,
    build_analysis: {
      total_artifacts: buildArtifacts.length,
      slot_coverage: buildArtifacts.map(a => a.slot),
      categories: [...new Set(buildArtifacts.map(a => a.categories.primary))],
      build_score: buildScore,
      power_level: getBuildPowerLevel(buildScore),
      recommendations: generateBuildRecommendations(buildArtifacts, combinedStats)
    }
  });
});

// GET /api/categories - Get all categories with stats
app.get('/api/categories', (req, res) => {
  const categories = {};
  
  Object.values(artifactsData.artifacts || []).forEach(artifact => {
    const cat = artifact.categories.primary;
    if (!categories[cat]) {
      categories[cat] = {
        name: cat,
        count: 0,
        avg_power_score: 0,
        artifacts: []
      };
    }
    categories[cat].count++;
    categories[cat].avg_power_score += artifact.gameplay_info.power_score || 0;
    categories[cat].artifacts.push(artifact.id);
  });
  
  // Calculate averages
  Object.values(categories).forEach(cat => {
    cat.avg_power_score = Math.round(cat.avg_power_score / cat.count * 10) / 10;
  });
  
  res.json(categories);
});

// GET /api/stats - Get database statistics
app.get('/api/stats', (req, res) => {
  res.json(artifactsData.metadata);
});

// Helper functions
function calculateBuildStats(artifacts) {
  const stats = {
    damage_bonuses: [],
    damage_resistance: [],
    shield_bonuses: [],
    healing_values: [],
    durations: [],
    power_scores: [],
    total_power_score: 0,
    synergy_multiplier: 1.0
  };
  
  artifacts.forEach(artifact => {
    const parsed = artifact.effect.parsed_values;
    
    if (parsed.damage_bonus) stats.damage_bonuses.push(parsed.damage_bonus);
    if (parsed.max_damage_bonus) stats.damage_bonuses.push(parsed.max_damage_bonus);
    if (parsed.damage_resistance) stats.damage_resistance.push(parsed.damage_resistance);
    if (parsed.max_damage_resistance) stats.damage_resistance.push(parsed.max_damage_resistance);
    if (parsed.shield_value) stats.shield_bonuses.push(parsed.shield_value);
    if (parsed.healing_value) stats.healing_values.push(parsed.healing_value);
    if (parsed.duration_seconds) stats.durations.push(parsed.duration_seconds);
    
    stats.power_scores.push(artifact.gameplay_info.power_score || 0);
    stats.total_power_score += artifact.gameplay_info.power_score || 0;
  });
  
  return stats;
}

function calculateSynergies(artifacts) {
  const synergies = {
    category_synergy: 0,
    mechanic_synergy: 0,
    playstyle_synergy: 0,
    trigger_synergy: 0,
    total_synergy: 0
  };
  
  if (artifacts.length <= 1) return synergies;
  
  // Category synergy (same categories work well together)
  const categories = artifacts.map(a => a.categories.primary);
  const uniqueCategories = new Set(categories);
  synergies.category_synergy = Math.max(0, categories.length - uniqueCategories.size) * 0.15;
  
  // Mechanic synergy
  const allMechanics = artifacts.flatMap(a => a.mechanics);
  const mechanicCounts = {};
  allMechanics.forEach(m => mechanicCounts[m] = (mechanicCounts[m] || 0) + 1);
  synergies.mechanic_synergy = Object.values(mechanicCounts)
    .filter(count => count > 1)
    .reduce((sum, count) => sum + (count - 1) * 0.1, 0);
  
  // Playstyle synergy
  const allPlaystyles = artifacts.flatMap(a => a.categories.playstyle);
  const playstyleSet = new Set(allPlaystyles);
  synergies.playstyle_synergy = Math.min(playstyleSet.size / 10, 0.2);
  
  // Trigger synergy (complementary triggers)
  const triggers = artifacts.flatMap(a => a.effect.triggers);
  synergies.trigger_synergy = Math.min(triggers.length / 20, 0.15);
  
  synergies.total_synergy = synergies.category_synergy + 
                           synergies.mechanic_synergy + 
                           synergies.playstyle_synergy + 
                           synergies.trigger_synergy;
  
  return synergies;
}

function calculateBuildScore(artifacts, stats, synergies) {
  const baseScore = stats.total_power_score;
  const synergyBonus = baseScore * synergies.total_synergy;
  const slotBonus = artifacts.length * 5; // Bonus for equipping more artifacts
  
  return Math.round((baseScore + synergyBonus + slotBonus) * 10) / 10;
}

function getBuildPowerLevel(score) {
  if (score >= 200) return 'GODLIKE';
  if (score >= 150) return 'LEGENDARY';
  if (score >= 100) return 'EPIC';
  if (score >= 70) return 'RARE';
  if (score >= 40) return 'UNCOMMON';
  return 'COMMON';
}

function generateBuildRecommendations(artifacts, stats) {
  const recommendations = [];
  
  if (artifacts.length < 4) {
    recommendations.push({
      type: 'missing_slots',
      message: `Equip ${4 - artifacts.length} more artifact${artifacts.length === 3 ? '' : 's'} to complete your build`,
      priority: 'high'
    });
  }
  
  if (stats.damage_bonuses.length === 0 && stats.damage_resistance.length === 0) {
    recommendations.push({
      type: 'lack_focus',
      message: 'Consider focusing on either offense or defense for better synergy',
      priority: 'medium'
    });
  }
  
  if (stats.total_power_score < 50) {
    recommendations.push({
      type: 'low_power',
      message: 'Try higher power score artifacts to improve your build',
      priority: 'medium'
    });
  }
  
  return recommendations;
}

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DESTINY RISING THEORYCRAFT API running on http://localhost:${PORT}`);
  console.log(`⚡ Ready to serve ${artifactsData.metadata?.total_artifacts || 0} artifacts`);
  console.log(`🎯 Power Score Range: ${artifactsData.metadata?.power_score_stats?.min || 0} - ${artifactsData.metadata?.power_score_stats?.max || 0}`);
});

module.exports = app;