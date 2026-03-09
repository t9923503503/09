/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TOURNAMENT ENGINE - REACT UI COMPONENTS
 * Production-ready UI for tournament management
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useEffect } from 'react';
import { DoubleElimTournament } from './doubleElimPlugin';
import { TournamentNavigator } from './tournamentNavigator';
import { TournamentHistory } from './tournamentHistory';
import { SpectatorMode } from './spectatorMode';
import './TournamentUI.css';

/**
 * Main Tournament Manager Component
 */
export function TournamentManager({ teams = [] }) {
  const [tournament, setTournament] = useState(null);
  const [navigator, setNavigator] = useState(null);
  const [history, setHistory] = useState(null);
  const [spectator, setSpectator] = useState(null);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [displayMode, setDisplayMode] = useState('bracket'); // bracket, standings, stats
  const [fontSize, setFontSize] = useState(1.5);

  // Initialize tournament
  const initTournament = useCallback((teamsData) => {
    if (!teamsData || teamsData.length === 0) {
      alert('Please provide teams');
      return;
    }

    const t = new DoubleElimTournament({
      name: 'Tournament 2026'
    });

    t.initializeSeeding(teamsData);
    t.generateBracket();

    const nav = new TournamentNavigator(t);
    const hist = new TournamentHistory(t);
    const spec = new SpectatorMode(t, nav);

    setTournament(t);
    setNavigator(nav);
    setHistory(hist);
    setSpectator(spec);
    setCurrentMatch(nav.getPendingMatches()[0] || null);
  }, []);

  // Record match result
  const recordResult = useCallback((matchId, winnerId) => {
    if (!tournament) return;

    try {
      tournament.advanceTeam(matchId, winnerId);
      history.takeSnapshot(`Match ${matchId} completed`);

      // Update current match
      const nextPending = navigator.getPendingMatches();
      setCurrentMatch(nextPending[0] || null);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }, [tournament, navigator, history]);

  // Undo action
  const undo = useCallback(() => {
    if (history && history.canUndo()) {
      history.undo();
      const nextPending = navigator.getPendingMatches();
      setCurrentMatch(nextPending[0] || null);
    }
  }, [history, navigator]);

  // Redo action
  const redo = useCallback(() => {
    if (history && history.canRedo()) {
      history.redo();
      const nextPending = navigator.getPendingMatches();
      setCurrentMatch(nextPending[0] || null);
    }
  }, [history, navigator]);

  if (!tournament) {
    return (
      <div className="tournament-setup">
        <h1>🏆 Tournament Engine</h1>
        <p>Initialize with teams to begin</p>
        <button onClick={() => initTournament(teams)}>
          Start Tournament
        </button>
      </div>
    );
  }

  return (
    <div className="tournament-container" style={{ '--font-size': fontSize }}>
      <header className="tournament-header">
        <h1>🏆 Tournament Manager</h1>
        <div className="controls">
          <button onClick={undo} disabled={!history?.canUndo()}>
            ⏮️ Undo
          </button>
          <button onClick={redo} disabled={!history?.canRedo()}>
            ⏭️ Redo
          </button>
          <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value)}>
            <option value="bracket">Bracket</option>
            <option value="standings">Standings</option>
            <option value="stats">Statistics</option>
          </select>
          <input
            type="range"
            min="0.8"
            max="3"
            step="0.1"
            value={fontSize}
            onChange={(e) => setFontSize(parseFloat(e.target.value))}
            title="Font size"
          />
          <span>{Math.round(fontSize * 100)}%</span>
        </div>
      </header>

      <main className="tournament-main">
        {displayMode === 'bracket' && (
          <BracketView
            tournament={tournament}
            currentMatch={currentMatch}
            onRecordResult={recordResult}
          />
        )}
        {displayMode === 'standings' && (
          <StandingsView spectator={spectator} />
        )}
        {displayMode === 'stats' && (
          <StatsView spectator={spectator} />
        )}
      </main>

      <footer className="tournament-footer">
        <div className="status">
          {navigator && (() => {
            const stats = navigator.getStatistics();
            return (
              <>
                <span>Progress: {stats.byStatus.completed}/{stats.totalMatches}</span>
                <span>Upsets: {stats.upsets}</span>
              </>
            );
          })()}
        </div>
      </footer>
    </div>
  );
}

/**
 * Bracket Display Component
 */
export function BracketView({ tournament, currentMatch, onRecordResult }) {
  const [selectedBracket, setSelectedBracket] = useState('WB');

  const bracket = tournament.bracket[selectedBracket === 'WB' ? 'winners' :
                                    selectedBracket === 'LB' ? 'losers' :
                                    'grand_final'];

  const matches = Array.isArray(bracket) ? bracket : [bracket];

  return (
    <div className="bracket-view">
      <div className="bracket-controls">
        <button
          onClick={() => setSelectedBracket('WB')}
          className={selectedBracket === 'WB' ? 'active' : ''}
        >
          Winners Bracket
        </button>
        <button
          onClick={() => setSelectedBracket('LB')}
          className={selectedBracket === 'LB' ? 'active' : ''}
        >
          Losers Bracket
        </button>
        <button
          onClick={() => setSelectedBracket('GF')}
          className={selectedBracket === 'GF' ? 'active' : ''}
        >
          Grand Final
        </button>
      </div>

      <div className="bracket-matches">
        {matches.map((match, idx) => (
          match && (
            <MatchCard
              key={match.id}
              match={match}
              tournament={tournament}
              isCurrent={match.id === currentMatch?.id}
              onRecordResult={onRecordResult}
            />
          )
        ))}
      </div>
    </div>
  );
}

/**
 * Match Card Component
 */
export function MatchCard({ match, tournament, isCurrent, onRecordResult }) {
  const teamA = tournament.teams.find(t => t.id === match.team_a_id);
  const teamB = tournament.teams.find(t => t.id === match.team_b_id);

  const isCompleted = match.status === 'completed';
  const isPending = match.status === 'pending';

  return (
    <div
      className={`match-card ${match.bracket} ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''} ${match.upsetAlert ? 'upset' : ''}`}
    >
      <div className="match-header">
        <span className="match-id">{match.id}</span>
        <span className="match-status">{match.status}</span>
      </div>

      <div className="match-body">
        <div className={`team team-a ${match.winner_id === match.team_a_id ? 'winner' : ''}`}>
          <div className="team-name">{teamA?.name || 'BYE'}</div>
          <div className="team-seed">#{teamA?.seed || '−'}</div>
          {isPending && (
            <button onClick={() => onRecordResult(match.id, match.team_a_id)}>
              Win
            </button>
          )}
        </div>

        <div className="match-vs">vs</div>

        <div className={`team team-b ${match.winner_id === match.team_b_id ? 'winner' : ''}`}>
          <div className="team-name">{teamB?.name || 'TBD'}</div>
          <div className="team-seed">#{teamB?.seed || '−'}</div>
          {isPending && (
            <button onClick={() => onRecordResult(match.id, match.team_b_id)}>
              Win
            </button>
          )}
        </div>
      </div>

      {isCompleted && match.winner_id && (
        <div className="match-winner">
          Winner: {tournament.teams.find(t => t.id === match.winner_id)?.name}
        </div>
      )}

      {match.upsetAlert && (
        <div className="upset-badge">🔥 UPSET</div>
      )}
    </div>
  );
}

/**
 * Standings Component
 */
export function StandingsView({ spectator }) {
  const standings = spectator.getStandings();

  return (
    <div className="standings-view">
      <section className="standings-section leaders">
        <h2>🏆 Leaders (0 losses)</h2>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Wins</th>
              <th>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {standings.leaders.map(team => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{team.wins}</td>
                <td>{team.winRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="standings-section active">
        <h2>⚡ Active (1 loss)</h2>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Wins</th>
              <th>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {standings.active.map(team => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{team.wins}</td>
                <td>{team.winRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="standings-section eliminated">
        <h2>⚰️ Eliminated (2+ losses)</h2>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Wins</th>
              <th>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {standings.eliminated.map(team => (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td>{team.wins}</td>
                <td>{team.winRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/**
 * Statistics Component
 */
export function StatsView({ spectator }) {
  const stats = spectator.getTournamentStats();

  const progressPercentage = (stats.played / stats.totalMatches) * 100;

  return (
    <div className="stats-view">
      <div className="stat-card">
        <h3>📊 Progress</h3>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPercentage}%` }} />
        </div>
        <p>{stats.played} / {stats.totalMatches} matches ({Math.round(progressPercentage)}%)</p>
      </div>

      <div className="stat-card">
        <h3>⚔️ Match Status</h3>
        <ul>
          <li>Completed: {stats.played}</li>
          <li>Remaining: {stats.remaining}</li>
          <li>Upsets: {stats.upsets}</li>
        </ul>
      </div>

      <div className="stat-card">
        <h3>⏱️ Time Estimate</h3>
        {stats.estimatedTime && (
          <ul>
            <li>Remaining matches: {stats.estimatedTime.remainingMatches}</li>
            <li>Est. time: {stats.estimatedTime.estimatedHours}h</li>
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Current Match Display Component
 */
export function CurrentMatchDisplay({ spectator }) {
  const current = spectator.getCurrentMatch();
  const upcoming = spectator.getUpcomingMatches(3);

  if (!current) {
    return <div className="current-match-display">Tournament Complete!</div>;
  }

  return (
    <div className="current-match-display">
      <div className="current">
        <h2>CURRENT MATCH</h2>
        <div className="match-display">
          <div className="team">{current.teamA?.name || 'BYE'}</div>
          <div className="vs">VS</div>
          <div className="team">{current.teamB?.name || 'TBD'}</div>
        </div>
      </div>

      <div className="upcoming">
        <h3>UPCOMING MATCHES</h3>
        {upcoming.map((match, idx) => (
          <div key={match.id} className="upcoming-match">
            {idx + 1}. {match.teamA?.name || 'BYE'} vs {match.teamB?.name || 'TBD'}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Spectator Mode Component (Large Display)
 */
export function SpectatorModeDisplay({ spectator, settings = {} }) {
  const [customSettings, setCustomSettings] = useState({
    fontSize: 2.0,
    contrastMode: false,
    ...settings
  });

  // Update spectator settings
  React.useEffect(() => {
    spectator.updateSettings(customSettings);
  }, [customSettings, spectator]);

  const colors = spectator.getColorScheme();
  const displaySettings = spectator.getDisplaySettings();

  return (
    <div
      className="spectator-display"
      style={{
        ...displaySettings.root,
        backgroundColor: colors.background,
        color: colors.foreground
      }}
    >
      <div className="spectator-controls">
        <button onClick={() => setCustomSettings(prev => ({
          ...prev,
          fontSize: Math.min(3, prev.fontSize + 0.1)
        }))}>
          + Zoom
        </button>
        <button onClick={() => setCustomSettings(prev => ({
          ...prev,
          fontSize: Math.max(0.8, prev.fontSize - 0.1)
        }))}>
          - Zoom
        </button>
        <button onClick={() => setCustomSettings(prev => ({
          ...prev,
          contrastMode: !prev.contrastMode
        }))}>
          🎨 Contrast
        </button>
      </div>

      <CurrentMatchDisplay spectator={spectator} />
      <StandingsView spectator={spectator} />
    </div>
  );
}

export default TournamentManager;
