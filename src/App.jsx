
import React, { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import './style.css';

const PAGE_SIZE = 100;
const MAX_LENGTH = 1000;
const VOTER_KEY = 'problem-board-voter-id';

function getVoterId() {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function ProblemSymbol() {
  return (
    <svg viewBox="0 0 100 100" width="100" height="100" fill="none">
      <path
        d="M50 9C27 9 9 26 9 48c0 14 7 25 19 32v12l18-8c3 1 7 2 11 2 23 0 40-17 40-40S73 9 50 9Z"
        fill="#ffffff"
        stroke="#171717"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <circle cx="35" cy="47" r="4.5" fill="#171717"/>
      <circle cx="50" cy="47" r="4.5" fill="#171717"/>
      <circle cx="65" cy="47" r="4.5" fill="#171717"/>
    </svg>
  );
}

export default function App() {
  const [showProblems, setShowProblems] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [agreeingId, setAgreeingId] = useState(null);
  const [error, setError] = useState('');

  const [agreedIds, setAgreedIds] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem('problem-board-agreed') || '[]'
      );
    } catch {
      return [];
    }
  });

  const loadProblems = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('problems')
        .select('id, name, content, created_at')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) throw fetchError;

      const ids = (data || []).map(p => p.id);
      let counts = {};

      if (ids.length) {
        const { data: votes, error: voteError } = await supabase
          .from('problem_agreements')
          .select('problem_id')
          .in('problem_id', ids);

        if (voteError) throw voteError;

        counts = (votes || []).reduce((acc, vote) => {
          acc[vote.problem_id] =
            (acc[vote.problem_id] || 0) + 1;
          return acc;
        }, {});
      }

      setProblems(
        (data || []).map(p => ({
          ...p,
          agree_count: counts[p.id] || 0,
        }))
      );

      setError('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not load problems.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProblems();

    if (!supabase) return;

    const channel = supabase
      .channel('problem-board-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'problems' },
        loadProblems
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'problem_agreements' },
        loadProblems
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProblems]);

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanContent = content.trim();

    if (!cleanName || !cleanContent || !supabase) return;

    setSending(true);
    setError('');

    try {
      const { data, error } = await supabase
        .from('problems')
        .insert([{
          name: cleanName,
          content: cleanContent,
        }])
        .select('id, name, content, created_at')
        .single();

      if (error) throw error;

      setProblems(current => [
        { ...data, agree_count: 0 },
        ...current,
      ].slice(0, PAGE_SIZE));

      setName('');
      setContent('');
      setComposerOpen(false);
      setShowProblems(true);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Submission failed.');
    } finally {
      setSending(false);
    }
  }

  async function handleAgree(problemId) {
    if (
      !supabase ||
      agreedIds.includes(problemId) ||
      agreeingId
    ) return;

    setAgreeingId(problemId);
    setError('');

    try {
      const { error } = await supabase
        .from('problem_agreements')
        .insert([{
          problem_id: problemId,
          voter_id: getVoterId(),
        }]);

      if (error && error.code !== '23505') throw error;

      if (!error) {
        const next = [...agreedIds, problemId];

        setAgreedIds(next);
        localStorage.setItem(
          'problem-board-agreed',
          JSON.stringify(next)
        );

        setProblems(current =>
          current.map(p =>
            p.id === problemId
              ? { ...p, agree_count: p.agree_count + 1 }
              : p
          )
        );
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not agree.');
    } finally {
      setAgreeingId(null);
    }
  }

  function toggleProblems() {
    setShowProblems(value => !value);
    setComposerOpen(false);
    setError('');
  }

  return (
    <main className="page">

      {/* Landing area */}

      <section className={`hero ${showProblems ? 'hero-small' : ''}`}>

        <h1>Tell me your problem</h1>

        <button
          className={`symbol-button ${showProblems ? 'symbol-active' : ''}`}
          onClick={toggleProblems}
          aria-label={showProblems ? 'Hide problems' : 'Explore problems'}
          aria-expanded={showProblems}
          type="button"
        >
          <ProblemSymbol />
          <span className="symbol-indicator">
            {showProblems ? '×' : '↗'}
          </span>
        </button>

      </section>

      {/* Problems section */}

      <section className={`feed ${showProblems ? 'feed-visible' : ''}`}>

        {showProblems && (
          <div className="feed-inner">

            <div className="feed-heading">
              <span>Community thoughts</span>
              <span>{problems.length} problems</span>
            </div>

            <button
              className="add-problem"
              onClick={() => {
                setComposerOpen(!composerOpen);
                setError('');
              }}
              type="button"
            >
              + Share your problem
            </button>

            {composerOpen && (
              <form className="composer" onSubmit={handleSubmit}>

                <input
                  className="name-input"
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={60}
                  required
                />

                <textarea
                  placeholder="What's on your mind?"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  maxLength={MAX_LENGTH}
                  required
                />

                <div className="composer-bottom">
                  <span>{content.length}/{MAX_LENGTH}</span>

                  <button
                    type="submit"
                    disabled={sending || !name.trim() || !content.trim()}
                  >
                    {sending ? 'Sending...' : 'Share ↗'}
                  </button>
                </div>
              </form>
            )}

            {error && (
              <p className="error">{error}</p>
            )}

            {!isSupabaseConfigured && (
              <p className="error">Supabase connection missing.</p>
            )}

            {loading ? (
              <p className="loading">Loading thoughts...</p>
            ) : (
              <div className="problem-grid">

                {problems.map((p, index) => {
                  const agreed = agreedIds.includes(p.id);

                  return (
                    <article
                      className={`problem-card card-${index % 6}`}
                      key={p.id}
                      style={{ '--card-index': index % 6 }}
                    >
                      <div className="card-top">
                        <span className="author">{p.name}</span>
                        <span className="card-date">
                          {formatDate(p.created_at)}
                        </span>
                      </div>

                      <p className="problem-content">
                        {p.content}
                      </p>

                      <div className="card-bottom">
                        <span className="agree-count">
                          {p.agree_count} people agree
                        </span>

                        <button
                          className={`agree-button ${agreed ? 'agreed' : ''}`}
                          onClick={() => handleAgree(p.id)}
                          disabled={agreed || agreeingId === p.id}
                          type="button"
                        >
                          {agreed ? 'Agreed ✓' : 'Agree +'}
                        </button>
                      </div>
                    </article>
                  );
                })}

              </div>
            )}

          </div>
        )}

      </section>

    </main>
  );
}
