import Image from "next/image";
import Link from "next/link";
import { LydraLogo } from "@/components/brand/LydraLogo";
import { LydianIllustrationPlaceholder } from "@/components/landing/LydianIllustrationPlaceholder";

export default function HomePage() {
  return (
    <main className="landing">
      <header className="site-header shell">
        <LydraLogo priority />
        <nav className="site-nav" aria-label="Navegação principal">
          <a href="#sobre">Sobre</a>
          <a href="#contato">Contato</a>
          <Link className="button button-small button-outline" href="/comparisons/new">
            Analisar orçamentos
          </Link>
        </nav>
      </header>

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-rule" /> Infraestrutura para decidir</p>
          <h1 id="hero-title">Decida antes que o dinheiro vá.</h1>
          <p className="hero-lede">
            Compare propostas, entenda o que realmente está sendo cobrado e identifique
            o que ainda precisa ser esclarecido antes de decidir.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/comparisons/new">
              Comparar orçamentos <span aria-hidden="true">↗</span>
            </Link>
            <a className="text-link" href="#sobre">Entender a Lydra <span aria-hidden="true">↓</span></a>
          </div>
          <p className="hero-note">Uma leitura criteriosa das propostas — sem transformar dúvida em certeza.</p>
        </div>
        <LydianIllustrationPlaceholder />
        <div className="hero-stamp" aria-hidden="true">
          <span>LD</span>
          <span>01 / 04</span>
        </div>
      </section>

      <section id="sobre" className="brand-intro shell" aria-labelledby="intro-title">
        <div className="section-index">01 <span>/</span> Por que Lydra</div>
        <div className="intro-grid">
          <div>
            <h2 id="intro-title">Uma proposta só parece simples até os detalhes mudarem a decisão.</h2>
          </div>
          <div className="intro-copy">
            <p>
              Orçamentos parecem comparáveis até que frete, prazo, condições e itens
              ausentes mudem o que cada valor realmente significa.
            </p>
            <p>
              A Lydra organiza essas informações, evidencia incertezas e coloca propostas
              lado a lado para que a decisão aconteça antes do compromisso financeiro.
            </p>
            <p className="muted">A Lydra assiste a decisão. Não decide pelo usuário.</p>
          </div>
        </div>
        <div className="architecture-strip" aria-hidden="true">
          <span className="strip-block strip-block-tall" />
          <span className="strip-line" />
          <span className="strip-block" />
          <span className="strip-arc" />
          <span className="strip-block strip-block-wide" />
          <span className="strip-line" />
          <span className="strip-block strip-block-small" />
        </div>
      </section>

      <section className="landing-cta shell" aria-labelledby="cta-title">
        <div>
          <p className="eyebrow"><span className="eyebrow-rule" /> O próximo movimento</p>
          <h2 id="cta-title">Coloque as propostas lado a lado.</h2>
        </div>
        <Link className="button button-primary" href="/comparisons/new">
          Começar uma comparação <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section id="contato" className="contact shell" aria-labelledby="contact-title">
        <div className="section-index">02 <span>/</span> Contato</div>
        <div className="contact-content">
          <h2 id="contact-title">Vamos construir decisões mais claras.</h2>
          <p className="muted">Fale com a Neres web design pelos canais oficiais:</p>
          <div className="contact-links" aria-label="Canais de contato">
            <a href="https://wa.me/5531982481194" target="_blank" rel="noreferrer">
              <span>Whatsapp</span>
              <strong>+55 (31) 98248-1194</strong>
            </a>
            <a href="https://instagram.com/neres.web" target="_blank" rel="noreferrer">
              <span>Instagram</span>
              <strong>@neres.web</strong>
            </a>
            <a href="mailto:nerescode@gmail.com">
              <span>Email</span>
              <strong>nerescode@gmail.com</strong>
            </a>
          </div>
        </div>
      </section>

      <footer className="site-footer shell" aria-labelledby="footer-title">
        <div className="footer-main">
          <div className="footer-brand">
            <LydraLogo compact />
            <p>Decida antes que o dinheiro vá.</p>
            <div className="footer-links">
              <a href="#sobre">Sobre</a>
              <a href="#contato">Contato</a>
            </div>
          </div>
          <div className="footer-cta">
            <p className="eyebrow"><span className="eyebrow-rule" /> O próximo passo</p>
            <h2 id="footer-title">Decisões melhores começam antes do compromisso.</h2>
            <Link className="button button-primary" href="/comparisons/new">
              Começar uma comparação <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="footer-contact">
            <span className="footer-label">Contato</span>
            <a href="https://wa.me/5531982481194" target="_blank" rel="noreferrer">Whatsapp</a>
            <a href="https://instagram.com/neres.web" target="_blank" rel="noreferrer">@neres.web</a>
            <a href="mailto:nerescode@gmail.com">nerescode@gmail.com</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Lydra</span>
          <div className="built-by">
            <span>Projeto desenvolvido por</span>
            <Image
              src="/brand/neres-web-design.svg"
              alt="Neres web design"
              width={52}
              height={52}
            />
            <strong>Neres web design</strong>
          </div>
        </div>
      </footer>
    </main>
  );
}
