import Image from "next/image";
import Link from "next/link";
import heroArtwork from "@/assets/lydra-hero.webp";
import { LydraLogo } from "@/components/brand/LydraLogo";
import { LydraReviews } from "@/components/landing/LydraReviews";
import { ComparisonJourney } from "@/components/landing/ComparisonJourney";
import "./landing.css";

const questions = [
  {
    question: "Que arquivos posso comparar?",
    answer: "Envie de 2 a 4 orçamentos em PDF, PNG, JPEG ou WebP, com até 10 MB por arquivo.",
  },
  {
    question: "E se uma proposta não informar o frete?",
    answer: "O custo fica marcado como parcial. O valor cobrado pelo fornecedor só pode ser confirmado quando o frete for esclarecido.",
  },
  {
    question: "Preciso enviar documentos para usar o simulador?",
    answer: "Você pode digitar os valores no simulador e calcular no navegador. Também pode partir de um orçamento que já tenha comparado.",
  },
];

export default function HomePage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <LydraLogo priority />
          <nav className="landing-nav" aria-label="Navegação principal">
            <a href="#sobre">O projeto</a>
            <a href="#como-funciona">Como funciona</a>
            <Link href="/simulador">Simulador</Link>
            <Link href="/conta">Minha conta</Link>
          </nav>
          <Link className="button button-outline landing-header-action" href="#modos">
            Comparar <span className="action-arrow" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-hero-art" aria-hidden="true">
            <Image src={heroArtwork} alt="" fill priority unoptimized sizes="100vw" />
          </div>
          <div className="landing-container landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-kicker">Comparador de orçamentos</p>
              <h1 id="hero-title">Decida antes<br />que o <em>dinheiro vá.</em></h1>
              <p className="landing-hero-intro">Compare propostas, veja o que cada preço inclui e saiba o que confirmar antes de contratar.</p>
              <div className="landing-hero-actions">
                <Link className="button button-primary" href="/comparisons/new">
                  Comparar orçamentos <span className="action-arrow" aria-hidden="true" />
                </Link>
                <a className="landing-text-link" href="/simulacao">Experimentar o modo simulado <span className="action-arrow" aria-hidden="true" /></a>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-container landing-chapter landing-project" id="sobre" aria-labelledby="project-title">
          <div>
            <p className="landing-kicker">O projeto Lydra</p>
            <h2 id="project-title">O preço é só<br />o <em>ponto de partida.</em></h2>
            <p>A Lydra organiza as informações de cada orçamento para você entender o que está sendo oferecido, o que o preço cobre e o que ainda precisa perguntar ao fornecedor.</p>
          </div>
          <dl className="landing-project-details">
            <div>
              <dt>Custo e escopo</dt>
              <dd>Veja quais itens e serviços foram incluídos e se o frete é cobrado à parte.</dd>
            </div>
            <div>
              <dt>Prazo e condições</dt>
              <dd>Confira os prazos de entrega, o pagamento e a garantia que cada proposta informa.</dd>
            </div>
            <div>
              <dt>Evidências e pendências</dt>
              <dd>Consulte trechos das propostas e veja quais informações precisam de confirmação.</dd>
            </div>
          </dl>
        </section>

        <ComparisonJourney />

        <section id="modos" className="landing-container landing-chapter landing-editorial" aria-labelledby="mode-title">
          <figure>
            <Image src="/images/conferencia-de-orcamentos.webp" width={1440} height={960}
              alt="Mãos de uma pessoa conferindo duas propostas impressas à mesa." sizes="(max-width: 800px) 90vw, 45vw" />
          </figure>
          <div>
            <p className="landing-kicker">Escolha uma comparação</p>
            <h2 id="mode-title">Das propostas <em>aos números.</em></h2>
            <div className="landing-mode-list">
              <div>
                <h3>Comparação real</h3>
                <p>Use suas próprias propostas. Envie PDFs ou imagens ou digite os valores para comparar custos, prazos e frete.</p>
                <Link className="button button-primary" href="/comparisons/new">Comparar propostas reais <span className="action-arrow" aria-hidden="true" /></Link>
              </div>
              <div>
                <h3>Comparação simulada</h3>
                <p>Escolha propostas fictícias para experimentar como a análise lida com frete incluso, adicional ou a confirmar.</p>
                <Link className="button button-outline" href="/simulacao">Testar modo simulado <span className="action-arrow" aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-simulator" id="simulador" aria-labelledby="simulator-title">
          <div className="landing-container landing-chapter landing-simulator-layout">
            <div>
              <p className="landing-kicker">Simulador de compra</p>
              <h2 id="simulator-title">Essa compra <em>cabe no teto?</em></h2>
              <p>Teste um frete ou desconto diferente e veja quanto sobra do valor que você pode gastar. Basta digitar os valores.</p>
              <Link className="button button-primary" href="/simulador">
                Abrir simulador <span className="action-arrow" aria-hidden="true" />
              </Link>
            </div>
            <div className="landing-scenario">
              <p className="landing-sample-label">Cenário de exemplo</p>
              <dl>
                <div><dt>Orçamento</dt><dd>R$ 4.500,00</dd></div>
                <div><dt>Frete adicional</dt><dd>+ R$ 200,00</dd></div>
                <div><dt>Desconto</dt><dd>− R$ 150,00</dd></div>
                <div className="landing-scenario-total"><dt>Total estimado</dt><dd>R$ 4.550,00</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section id="reputacao" className="landing-container landing-chapter landing-trust" aria-labelledby="trust-title">
          <div>
            <p className="landing-kicker">Antes de contratar</p>
            <h2 id="trust-title">Confira a <em>reputação.</em></h2>
            <figure>
              <Image src="/images/propostas-sobre-a-mesa.webp" width={1440} height={960}
                alt="Propostas de orçamento, lápis e régua sobre uma mesa de tons terrosos." sizes="(max-width: 800px) 90vw, 45vw" />
            </figure>
            <div className="trust-resources">
              <a href="https://www.reclameaqui.com.br/" target="_blank" rel="noreferrer">
                <strong>Reclame AQUI</strong><span>Consulte reclamações e respostas da empresa.</span>
              </a>
              <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">
                <strong>Avaliações no Google Maps</strong><span>Busque pelo nome e pela cidade do fornecedor.</span>
              </a>
            </div>
          </div>
          <LydraReviews />
        </section>

        <section className="landing-container landing-chapter landing-faq" aria-labelledby="faq-title">
          <div>
            <p className="landing-kicker">Perguntas frequentes</p>
            <h2 id="faq-title">Antes de <em>começar.</em></h2>
          </div>
          <div className="landing-faq-list">
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>{question} <span aria-hidden="true">+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-start" aria-labelledby="start-title">
          <div className="landing-container landing-chapter landing-start-layout">
            <h2 id="start-title">Coloque as propostas <em>lado a lado.</em></h2>
            <Link className="button button-primary" href="/comparisons/new">
              Começar uma comparação <span className="action-arrow" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer id="contato" className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-main">
            <LydraLogo compact />
            <nav aria-label="Links da Lydra">
              <a href="#sobre">O projeto</a>
              <a href="#como-funciona">Como funciona</a>
              <Link href="/simulador">Simulador</Link>
              <a href="#reputacao">Reputação e avaliações</a>
            </nav>
            <div className="landing-footer-contact">
              <strong>Contato</strong>
              <a href="mailto:nerescode@gmail.com">nerescode@gmail.com</a>
              <a href="https://wa.me/5531982481194">WhatsApp</a>
              <a href="https://instagram.com/neres.web">Instagram</a>
            </div>
          </div>
          <div className="landing-footer-base">
            <span>© {new Date().getFullYear()} Lydra</span>
            <span>Desenvolvido por <strong>Neres web design</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
