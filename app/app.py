"""Streamlit dashboard for the global AI mega-round landscape."""

from __future__ import annotations

import plotly.express as px
import streamlit as st

from analytics import (
    apply_round_filters,
    co_investment_pairs,
    funding_by,
    investor_activity,
    metric_snapshot,
    profile_completion,
    top_startups,
    usd_short,
    year_shift,
)
from data_loader import load_tables


st.set_page_config(
    page_title="AI Mega-Round Radar",
    page_icon="",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
    .block-container {padding-top: 1.25rem; padding-bottom: 2rem;}
    [data-testid="stMetric"] {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 14px 16px;
        background: #ffffff;
    }
    [data-testid="stMetricLabel"] {font-size: 0.82rem;}
    [data-testid="stMetricValue"] {font-size: 1.55rem;}
    .scope-note {
        border-left: 4px solid #0f766e;
        background: #f0fdfa;
        padding: 0.75rem 1rem;
        margin-bottom: 1rem;
        color: #134e4a;
        font-size: 0.94rem;
    }
    .small-muted {color: #6b7280; font-size: 0.88rem;}
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data(show_spinner=False)
def _load():
    return load_tables()


tables = _load()
rounds = tables["rounds_enriched"]
participations = tables["participations_enriched"]
growth = tables["growth"]
trajectory = tables["trajectory"]
profiles = tables["profiles"]

st.title("AI Mega-Round Radar")
st.markdown(
    """
    <div class="scope-note">
    Curated public funding events for AI-native and AI-infrastructure companies with rounds of at least USD 100M.
    The dataset is designed for market structure analysis, not as a claim that every global AI startup is represented.
    </div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.header("Filters")
    year_options = sorted(int(year) for year in rounds["year"].dropna().unique())
    region_options = sorted(rounds["region"].dropna().unique())
    domain_options = sorted(rounds["primary_domain"].dropna().unique())
    confidence_options = sorted(rounds["confidence"].dropna().unique())

    selected_years = st.multiselect("Years", year_options, default=year_options)
    selected_regions = st.multiselect("Regions", region_options, default=region_options)
    selected_domains = st.multiselect("AI domains", domain_options, default=domain_options)
    selected_confidence = st.multiselect(
        "Evidence confidence", confidence_options, default=confidence_options
    )
    st.caption("2026 should be treated as an in-progress market year.")

filtered_rounds = apply_round_filters(
    rounds,
    selected_years,
    selected_regions,
    selected_domains,
    selected_confidence,
)
filtered_participations = participations[
    participations["round_id"].isin(set(filtered_rounds["round_id"]))
].copy()

overview_tab, companies_tab, investors_tab, shifts_tab, quality_tab = st.tabs(
    ["Overview", "Companies", "Investors", "Shifts", "Data Quality"]
)

with overview_tab:
    snapshot = metric_snapshot(filtered_rounds, participations)
    cols = st.columns(4)
    for column, (label, value) in zip(cols, snapshot.items()):
        column.metric(label, value)

    left, right = st.columns([1.15, 0.85], gap="large")
    with left:
        st.subheader("Funding by Region and Year")
        region_year = funding_by(filtered_rounds, ["year", "region"])
        if region_year.empty:
            st.info("No rounds match the current filters.")
        else:
            fig = px.bar(
                region_year,
                x="year",
                y="amount_usd",
                color="region",
                text=region_year["amount_usd"].map(usd_short),
                labels={"amount_usd": "Funding", "year": "Year", "region": "Region"},
            )
            fig.update_layout(yaxis_tickformat="$,.0s", legend_title_text="")
            fig.update_traces(textposition="outside", cliponaxis=False)
            st.plotly_chart(fig, use_container_width=True)

    with right:
        st.subheader("Top AI Domains")
        domains = funding_by(filtered_rounds, ["primary_domain"]).head(10)
        if not domains.empty:
            fig = px.bar(
                domains.sort_values("amount_usd"),
                x="amount_usd",
                y="primary_domain",
                orientation="h",
                labels={"amount_usd": "Funding", "primary_domain": ""},
            )
            fig.update_layout(xaxis_tickformat="$,.0s", showlegend=False)
            st.plotly_chart(fig, use_container_width=True)

    st.subheader("Largest Funding Events")
    largest = filtered_rounds.sort_values("amount_usd", ascending=False).head(20)
    st.dataframe(
        largest[
            [
                "name",
                "round_type",
                "round_date",
                "amount_usd",
                "region",
                "country",
                "primary_domain",
                "confidence",
                "source_url",
            ]
        ].rename(
            columns={
                "name": "Startup",
                "round_type": "Round",
                "round_date": "Date",
                "amount_usd": "Amount",
                "region": "Region",
                "country": "Country",
                "primary_domain": "Domain",
                "confidence": "Confidence",
                "source_url": "Source",
            }
        ),
        use_container_width=True,
        hide_index=True,
        column_config={
            "Amount": st.column_config.NumberColumn("Amount", format="$%d"),
            "Source": st.column_config.LinkColumn("Source"),
        },
    )

with companies_tab:
    left, right = st.columns([1.05, 0.95], gap="large")
    top_company_table = top_startups(filtered_rounds, growth, limit=40)

    with left:
        st.subheader("Company Leaderboard")
        st.dataframe(
            top_company_table[
                [
                    "name",
                    "region",
                    "country",
                    "primary_domain",
                    "mega_round_count",
                    "active_mega_round_years",
                    "total_mega_round_amount_usd",
                    "largest_round_usd",
                    "trajectory_label",
                ]
            ].rename(
                columns={
                    "name": "Startup",
                    "region": "Region",
                    "country": "Country",
                    "primary_domain": "Domain",
                    "mega_round_count": "Rounds",
                    "active_mega_round_years": "Active years",
                    "total_mega_round_amount_usd": "Total mega-round funding",
                    "largest_round_usd": "Largest round",
                    "trajectory_label": "Trajectory",
                }
            ),
            use_container_width=True,
            hide_index=True,
            column_config={
                "Total mega-round funding": st.column_config.NumberColumn(
                    "Total mega-round funding", format="$%d"
                ),
                "Largest round": st.column_config.NumberColumn("Largest round", format="$%d"),
            },
        )

    with right:
        st.subheader("Company Profile")
        selectable = top_company_table["name"].tolist()
        selected_name = st.selectbox("Startup", selectable) if selectable else None
        if selected_name:
            startup_id = top_company_table[top_company_table["name"] == selected_name]["startup_id"].iloc[0]
            profile = profiles[profiles["startup_id"] == startup_id].iloc[0]
            company_rounds = filtered_rounds[filtered_rounds["startup_id"] == startup_id].sort_values(
                "round_date"
            )
            company_trajectory = trajectory[trajectory["startup_id"] == startup_id].sort_values("year")

            st.markdown(f"**{profile['name']}**")
            st.write(profile["notes"] or "No profile note has been added yet.")
            profile_cols = st.columns(3)
            profile_cols[0].metric("Founded", profile["founded_year"] or "Unknown")
            profile_cols[1].metric("Region", profile["region"])
            profile_cols[2].metric("Profile", profile["profile_confidence"] or "Pending")
            if profile["website"]:
                st.link_button("Open website", profile["website"])

            if not company_trajectory.empty:
                fig = px.line(
                    company_trajectory,
                    x="year",
                    y="cumulative_amount_usd",
                    markers=True,
                    labels={"year": "Year", "cumulative_amount_usd": "Cumulative mega-round funding"},
                )
                fig.update_layout(yaxis_tickformat="$,.0s")
                st.plotly_chart(fig, use_container_width=True)

            st.dataframe(
                company_rounds[["round_date", "round_type", "amount_usd", "confidence", "source_url"]].rename(
                    columns={
                        "round_date": "Date",
                        "round_type": "Round",
                        "amount_usd": "Amount",
                        "confidence": "Confidence",
                        "source_url": "Source",
                    }
                ),
                use_container_width=True,
                hide_index=True,
                column_config={
                    "Amount": st.column_config.NumberColumn("Amount", format="$%d"),
                    "Source": st.column_config.LinkColumn("Source"),
                },
            )

with investors_tab:
    st.subheader("Investor Activity")
    investor_table = investor_activity(filtered_rounds, participations, limit=50)
    st.dataframe(
        investor_table,
        use_container_width=True,
        hide_index=True,
        column_config={"Linked funding": st.column_config.NumberColumn("Linked funding", format="$%d")},
    )

    left, right = st.columns(2, gap="large")
    with left:
        st.subheader("Co-Investment Pairs")
        pairs = co_investment_pairs(filtered_rounds, participations, limit=40)
        st.dataframe(
            pairs,
            use_container_width=True,
            hide_index=True,
            column_config={"Linked funding": st.column_config.NumberColumn("Linked funding", format="$%d")},
        )

    with right:
        st.subheader("Investor Type Mix")
        if not filtered_participations.empty:
            type_mix = (
                filtered_participations.groupby("investor_type", dropna=False)
                .agg(rounds=("round_id", "nunique"), investors=("investor_id", "nunique"))
                .reset_index()
                .sort_values("rounds", ascending=False)
            )
            fig = px.bar(
                type_mix,
                x="rounds",
                y="investor_type",
                orientation="h",
                labels={"rounds": "Rounds", "investor_type": ""},
            )
            st.plotly_chart(fig, use_container_width=True)

with shifts_tab:
    st.subheader("What Shifted from 2024 to 2026")
    st.markdown(
        '<div class="small-muted">Use this view to compare capital movement across regions and AI domains. '
        "The numbers show reported mega-round funding only.</div>",
        unsafe_allow_html=True,
    )
    left, right = st.columns(2, gap="large")

    with left:
        domain_shift = year_shift(filtered_rounds)
        if not domain_shift.empty:
            fig = px.area(
                domain_shift,
                x="year",
                y="funding_bn",
                color="primary_domain",
                labels={"year": "Year", "funding_bn": "Funding, USD bn", "primary_domain": "Domain"},
            )
            st.plotly_chart(fig, use_container_width=True)

    with right:
        region_shift = funding_by(filtered_rounds, ["year", "region"])
        if not region_shift.empty:
            fig = px.line(
                region_shift,
                x="year",
                y="amount_usd",
                color="region",
                markers=True,
                labels={"amount_usd": "Funding", "year": "Year", "region": "Region"},
            )
            fig.update_layout(yaxis_tickformat="$,.0s")
            st.plotly_chart(fig, use_container_width=True)

    st.subheader("Yearly Region-Domain Matrix")
    matrix = funding_by(filtered_rounds, ["year", "region", "primary_domain"])
    st.dataframe(
        matrix.rename(
            columns={
                "year": "Year",
                "region": "Region",
                "primary_domain": "Domain",
                "amount_usd": "Funding",
                "rounds": "Rounds",
                "startups": "Startups",
            }
        ),
        use_container_width=True,
        hide_index=True,
        column_config={"Funding": st.column_config.NumberColumn("Funding", format="$%d")},
    )

with quality_tab:
    cols = st.columns(4)
    cols[0].metric("Evidence confidence", ", ".join(sorted(filtered_rounds["confidence"].unique())))
    cols[1].metric("High-confidence rounds", int((filtered_rounds["confidence"] == "high").sum()))
    cols[2].metric("Profile enrichment", f"{int(profiles['is_enriched'].sum())}/{len(profiles)}")
    cols[3].metric("Source types", filtered_rounds["source_type"].nunique())

    left, right = st.columns(2, gap="large")
    with left:
        st.subheader("Confidence by Year")
        confidence = funding_by(filtered_rounds, ["year", "confidence"])
        if not confidence.empty:
            fig = px.bar(
                confidence,
                x="year",
                y="rounds",
                color="confidence",
                labels={"rounds": "Rounds", "year": "Year", "confidence": "Confidence"},
            )
            st.plotly_chart(fig, use_container_width=True)

    with right:
        st.subheader("Profile Field Completion")
        completion = profile_completion(profiles)
        fig = px.bar(
            completion,
            x="Completion",
            y="Field",
            orientation="h",
            labels={"Completion": "Completion", "Field": ""},
        )
        fig.update_layout(xaxis_tickformat=".0%")
        st.plotly_chart(fig, use_container_width=True)

    st.subheader("Interpretation Guardrails")
    st.write(
        "Use high- and medium-confidence rows for exploratory market analysis. "
        "Do not describe this as the full AI startup ecosystem. The dataset captures reported mega-rounds "
        "above the selected threshold and is intentionally biased toward visible, well-sourced financings."
    )
