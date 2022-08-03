import * as React from "react";
import Head from "next/head";
import "../styles/globals.css";

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }) {
    return (
        <>
            <Head>
                <link href="https://fonts.googleapis.com" />
                <link href="https://fonts.gstatic.com" />
                <link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;700&family=Major+Mono+Display&family=Roboto+Condensed:wght@700&display=swap" />
            </Head>
            <Component {...pageProps} />
        </>
    );
}
